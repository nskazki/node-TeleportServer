var SocketsController = require('../libs/SocketsController');
var PeersController = require('../libs/PeersController');
var ObjectsController = require('../libs/ObjectsController');
var TeleportServer = require('..');

var Socket = require('socket.io-client');

var assert = require('assert');
var util = require('util');
var events = require('events');

var port = 8000;

function socketClose(socket) {
	socket.packet({
		"type": 1,
		"nsp": "/"
	});

	//some socket.io-client bug
	//if disabled 500 ms delay disconnect message 
	//not sended to server

	//this bug worked if before #close call #send method
	//if call #close method after !connect - all ok :)
	setTimeout(function() {
		socket.destroy();
		socket.onclose('io client disconnect');
	}, 500);
}

describe('SocketsController', function() {
	var socketsController, peersController;
	var socket;

	beforeEach(function(done) {
		port++;

		socketsController = new SocketsController(port).on('socketsControllerReady', done);

		peersController = new events.EventEmitter();
		socketsController.up(peersController);

		socket = new Socket('http://localhost:' + port, {
			forceNew: true,
			reconnection: false
		});
	});

	afterEach(function(done) {
		socket.removeAllListeners();
		socketClose(socket);

		peersController.removeAllListeners();

		socketsController.removeAllListeners()
			.on('socketsControllerDestroyed', function() {
				socketsController.removeAllListeners();
				done();
			})
			.on('socketsControllerAlreadyDestroyed', function() {
				socketsController.removeAllListeners();
				done();
			})
			.destroy();
	})

	it('#close - two server, one port', function(done) {
		socketsController.on('socketsControllerDestroyed', function() {
			socketsController = new SocketsController(port);
			socketsController.on('socketsControllerReady', done);
			socketsController.on('socketsControllerError', done);
		}).destroy();
	});

	it('!socketConnection', function(done) {
		socketsController.on('socketConnection', function(id) {
			socketClose(socket);
			done();
		});
	});

	it('!socketMessage', function(done) {
		var messageToSend = {
			hello: 'world!'
		};

		socketsController.on('socketMessage', function(id, message) {
			assert.deepEqual(message, messageToSend);
			done();
		});

		socket.send(messageToSend);
	});

	it('!socketDisconnection', function(done) {
		socketsController
			.on('socketConnection', function() {
				socketClose(socket);
			})
			.on('socketDisconnection', function(id) {
				done();
			});
	});

	it('!socketDisconnection x2', function(done) {
		socketsController
			.on('socketMessage', function(id, message) {
				assert.equal(message, 'some test');
				socketClose(socket);
			})
			.on('socketDisconnection', function(id) {
				done();
			})
			.on('socketConnection', function() {
				socket.send('some test');
			})
	});

	it('~needSocketSend', function(done) {
		socketsController.on('socketConnection', function(id) {
			peersController.emit('needSocketSend', id, 'hello');
		})

		socket.on('message', function(message) {
			assert.equal(message, 'hello');

			done();
		});
	});

	it('#destroy', function(done) {
		this.timeout(5000);

		socketsController.on('socketConnection', function() {
			socketsController.destroy();
		})

		socketsController.on('socketsControllerDestroyed', function() {
			var socket2 = new Socket('http://localhost:' + port, {
				forceNew: true,
				reconnection: false
			});

			socket2.on('connect_error', function() {
				done()
			})
		});
	});
});

describe('PeersController', function() {
	var socketsController, peersController, objectsController;
	var socket;

	beforeEach(function(done) {
		port++;

		objectsController = new events.EventEmitter();
		socketsController = new SocketsController(port);
		peersController = new PeersController(200);

		socketsController.up(peersController);
		peersController.down(socketsController).up(objectsController);

		socketsController.on('socketsControllerReady', done);

		socket = new Socket('ws://localhost:' + port)
	});

	afterEach(function(done) {
		objectsController.removeAllListeners();
		peersController.removeAllListeners().destroy();

		socketsController
			.removeAllListeners()
			.on('socketsControllerDestroyed', function() {
				socketsController.removeAllListeners();
				done();
			})
			.on('socketsControllerAlreadyDestroyed', function() {
				socketsController.removeAllListeners();
				done();
			})
			.destroy();

		socketClose(socket);
	})

	it('!peerConnection', function(done) {
		peersController.on('peerConnection', function(id) {
			assert.equal(id, 0);
			done();
		});


		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});
	});

	it('!peerDisconnectedTimeout', function(done) {
		peersController
			.on('peerConnection', function(id) {
				assert.equal(id, 0);

				socketClose(socket);
			})
			.on('peerDisconnectedTimeout', function(id) {
				assert.equal(id, 0);

				done();
			});

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});
	});

	it('!peerDisconnectedTimeout && get new peerId', function(done) {
		var clientTimestamp = new Date().valueOf();

		peersController.on('peerConnection', function(id) {
			socketClose(socket);
		});

		peersController.on('peerDisconnectedTimeout', function(id) {
			assert.equal(id, 0);

			var socket2 = new Socket('ws://localhost:' + port, {
				forceNew: true
			});

			socket2
				.on('message', function(message) {
					assert.deepEqual(message, {
						type: 'internalCallback',
						internalCommand: 'reconnect',
						error: null,
						result: {
							newPeerId: 1
						}
					});
					socketClose(socket2);

					done();
				})
				.send({
					type: 'internalCommand',
					internalCommand: 'reconnect',
					args: {
						clientTimestamp: clientTimestamp,
						peerId: id
					}
				});
		});

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: clientTimestamp
			}
		})
	});

	it('~needPeerSend', function(done) {
		peersController.on('peerConnection', function(id) {
			assert.equal(id, 0);
			objectsController.emit('needPeerSend', id, 'hello');
		})

		socket
			.on('message', function(message) {
				if (message == 'hello') {
					socketClose(socket);
					peersController.destroy();
					socketsController.destroy();

					done();
				}
			})
			.send({
				type: 'internalCommand',
				internalCommand: 'connect',
				args: {
					clientTimestamp: new Date().valueOf()
				}
			})
	});

	it('!peerReconnection', function(done) {
		var clientTimestamp = new Date().valueOf();
		var count = [];

		peersController.on('peerConnection', function(id) {
			assert.equal(id, 0);
			socketClose(socket);
		});

		peersController.on('peerDisconnection', function(id) {
			assert.equal(id, 0);

			var socket2 = new Socket('ws://localhost:' + port, {
					forceNew: true
				})
				.on('message', function(message) {
					assert.deepEqual(message, {
						type: 'internalCallback',
						internalCommand: 'reconnect',
						error: null,
						result: 'reconnected!'
					})

					count.push('message');
					if (count.length == 2) {
						socketClose(socket2);

						done();
					}
				})
				.send({
					type: 'internalCommand',
					internalCommand: 'reconnect',
					args: {
						clientTimestamp: clientTimestamp,
						peerId: id
					}
				})
		});

		peersController.on('peerReconnection', function(id) {
			assert.equal(id, 0);

			count.push('peerReconnection');
		});

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: clientTimestamp
			}
		});
	});

	it('~needPeerSend, while peer disconnected', function(done) {
		var clientTimestamp = new Date().valueOf();
		var count = [];

		peersController.on('peerConnection', function(id) {
			assert.equal(id, 0);

			socketClose(socket);
		});

		peersController.on('peerDisconnection', function(id) {
			assert.equal(id, 0);

			objectsController.emit('needPeerSend', id, 'hello :)');

			var socket2 = new Socket('ws://localhost:' + port, {
				forceNew: true
			});

			socket2.send({
				type: 'internalCommand',
				internalCommand: 'reconnect',
				args: {
					clientTimestamp: clientTimestamp,
					peerId: id
				}
			});

			var messageCount = 0;
			socket2.on('message', function(message) {
				messageCount++;
				if (messageCount === 2) assert.deepEqual(message, 'hello :)');

				count.push('message');
				if (count.length == 3) {
					socketClose(socket2);
					done();
				}
			})
		});

		peersController.on('peerReconnection', function(id) {
			assert.equal(id, 0);
			count.push('peerReconnection');
		});

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: clientTimestamp
			}
		});
	});

	it('~needPeersBroadcastSend', function(done) {
		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});

		peersController.on('peerConnection', function(id) {
			assert.equal(id, 0);

			socket.on('message', function(message) {
				assert.equal(message, 'hello');
				done();
			});

			objectsController.emit('needPeersBroadcastSend', 'hello');
		})
	});



	it('!peerDisconnection', function(done) {
		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});

		peersController.on('peerConnection', function(peerId) {
			assert.equal(peerId, 0);
			socketClose(socket);
		});
		peersController.on('peerDisconnection', function(peerId) {
			assert.equal(peerId, 0);
			done();
		})
	});
});

describe('ObjectsController', function() {
	var objectsController, socketsController, peersController;
	var socket;
	var objWithFuncAndEvents;

	beforeEach(function(done) {
		port++;
		objWithFuncAndEvents = new ClassWithFuncAndEvents();

		objectsController = new ObjectsController({
			'blank': {
				object: objWithFuncAndEvents,
				methods: ['simpleFunc'],
				events: ['simpleEvent']
			}
		});

		socketsController = new SocketsController(port);
		peersController = new PeersController(100);

		socketsController.up(peersController).on('socketsControllerReady', done);;
		peersController.down(socketsController).up(objectsController);
		objectsController.down(peersController);

		socket = new Socket('http://localhost:' + port);
	});


	afterEach(function(done) {
		objWithFuncAndEvents.removeAllListeners();
		objectsController.removeAllListeners().destroy();
		peersController.removeAllListeners().destroy();

		socketsController
			.removeAllListeners()
			.on('socketsControllerDestroyed', function() {
				socketsController.removeAllListeners();
				done();
			})
			.on('socketsControllerAlreadyDestroyed', function() {
				socketsController.removeAllListeners();
				done();
			})
			.destroy();

		socketClose(socket);
	});

	it('~needObjectsSend', function(done) {
		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});

		socket.on('message', function(message) {
			assert.deepEqual({
				type: "internalCallback",
				internalCommand: "connect",
				error: null,
				result: {
					peerId: 0,
					objectsProps: {
						blank: {
							methods: ['simpleFunc'],
							events: ['simpleEvent']
						}
					}
				}
			}, message);

			done();
		});
	})

	it('!needPeersBroadcastSend', function(done) {
		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});

		var count = 0;;
		socket.on('message', function(message) {
			count++;

			if (count === 1) objWithFuncAndEvents.emit('simpleEvent', 'one', 2, '10');
			if (count === 2) assert.deepEqual(message, {
				type: 'event',
				objectName: 'blank',
				eventName: 'simpleEvent',
				args: ['one', 2, '10']
			});
			if (count === 2) {

				done();
			}
		});
	});

	it('!peerMessage', function(done) {
		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});

		socket.send({
			type: 'command',
			objectName: 'blank',
			methodName: 'simpleFunc',
			args: ['some arg'],
			requestId: 0
		});

		var count = 0;;
		socket.on('message', function(message) {
			count++;

			if (count === 2) assert.deepEqual(message, {
				type: 'callback',
				objectName: 'blank',
				methodName: 'simpleFunc',
				requestId: 0,
				error: null,
				result: 'some arg'
			});
			if (count === 2) {
				done();
			}
		});
	});
})

describe('TeleportServer', function() {
	var objWithFuncAndEvents, teleportServer;
	var socket;

	beforeEach(function(done) {
		port++;

		objWithFuncAndEvents = new ClassWithFuncAndEvents();

		teleportServer = new TeleportServer({
			port: port,
			peerDisconnectedTimeout: 500,
			objects: {
				'blank': {
					object: objWithFuncAndEvents,
					methods: ['simpleFunc'],
					events: ['simpleEvent']
				}
			}
		}).on('ready', done);

		socket = new Socket('http://localhost:' + port);
	});

	afterEach(function(done) {
		objWithFuncAndEvents.removeAllListeners();

		teleportServer.removeAllListeners()
			.on('destroyed', function() {
				teleportServer.removeAllListeners();
				done();
			})
			.on('alreadyDestroyed', function() {
				teleportServer.removeAllListeners();
				done();
			})
			.destroy();
	
		socketClose(socket);
	})

	it('!clientConnection', function(done) {
		teleportServer.on('clientConnection', function(id) {
			assert.equal(id, 0);
			done();
		});

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});
	})

	it('!clientDisconnection', function(done) {
		teleportServer.on('clientDisconnection', function(id) {
			assert.equal(id, 0);

			done();
		});

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});

		socket.on('message', function(message) {
			socketClose(socket);
		})
	})


	it('!clientDisconnectedTimeout', function(done) {
		teleportServer.on('clientDisconnectedTimeout', function(id) {
			assert.equal(id, 0);

			done();
		});

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});

		socket.on('message', function(message) {
			socketClose(socket);
		})
	})

	it('!clientReconnection', function(done) {
		var clientTimestamp = new Date().valueOf();

		teleportServer.on('clientDisconnection', function(id) {

			var socket2 = new Socket('http://localhost:' + port, {
				forceNew: true
			});

			socket2.send({
				type: 'internalCommand',
				internalCommand: 'reconnect',
				args: {
					clientTimestamp: clientTimestamp,
					peerId: id
				}
			})

			socket2.on('message', function() {
				socketClose(socket2);
			});
		}).on('clientReconnection', function(id) {
			assert.equal(id, 0);

			done();
		});

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: clientTimestamp
			}
		});

		socket.on('message', function(message) {
			socketClose(socket);
		})
	})

	it('call command after !clientReconnection', function(done) {
		var clientTimestamp = new Date().valueOf();

		teleportServer.on('clientConnection', function() {
			socketClose(socket);
		}).on('clientDisconnection', function(id) {

			socket = new Socket('http://localhost:' + port, {
				forceNew: true
			});

			socket.send({
				type: 'internalCommand',
				internalCommand: 'reconnect',
				args: {
					clientTimestamp: clientTimestamp,
					peerId: id
				}
			})
		}).on('clientReconnection', function(id) {
			socket.send({
				type: 'command',
				objectName: 'blank',
				methodName: 'simpleFunc',
				requestId: 0,
				args: ['nyan']
			});

			var messageCount = 0;
			socket.on('message', function(message) {
				messageCount++;

				if (messageCount == 2) {
					assert.deepEqual(message, {
						type: 'callback',
						objectName: 'blank',
						methodName: 'simpleFunc',
						requestId: 0,
						error: null,
						result: 'nyan'
					});

					done();
				}
			})
		});

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: clientTimestamp
			}
		});
	})

	it('emit event after !clientReconnection', function(done) {
		var clientTimestamp = new Date().valueOf();

		teleportServer.on('clientConnection', function() {
			socketClose(socket);
		}).on('clientDisconnection', function(id) {

			socket = new Socket('http://localhost:' + port, {
				forceNew: true
			});

			socket.send({
				type: 'internalCommand',
				internalCommand: 'reconnect',
				args: {
					clientTimestamp: clientTimestamp,
					peerId: id
				}
			})
		}).on('clientReconnection', function(id) {
			objWithFuncAndEvents.emit('simpleEvent', 'hello')

			var messageCount = 0;
			socket.on('message', function(message) {
				messageCount++;

				if (messageCount == 2) {
					assert.deepEqual(message, {
						type: 'event',
						objectName: 'blank',
						eventName: 'simpleEvent',
						args: ['hello']
					});

					done();
				}
			})
		});

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: clientTimestamp
			}
		});
	})

	it('#destroy', function(done) {
		var clientTimestamp = new Date().valueOf();

		teleportServer.on('clientConnection', function() {

			teleportServer.destroy();
		}).on('destroyed', done);

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: clientTimestamp
			}
		});

	})
});

//
util.inherits(ClassWithFuncAndEvents, events.EventEmitter);

function ClassWithFuncAndEvents() {}

ClassWithFuncAndEvents.prototype.simpleFunc = function(arg, callback) {
	callback(null, arg);
};