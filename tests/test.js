'use strict';

var SocketsController = require('../libs/SocketsController');
var PeersController = require('../libs/PeersController');
var ObjectsController = require('../libs/ObjectsController');
var TeleportServer = require('..');

var debug = require('debug')('TeleportServer:test');
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
		debug('----beforeEach----');
		port++;

		socketsController = new SocketsController(port)
			.on('socketsControllerReady',
				function() {
					debug('----beforeEach----');
					done();
				});

		peersController = new events.EventEmitter();
		socketsController.up(peersController);

		socket = new Socket('http://localhost:' + port, {
			forceNew: true,
			reconnection: false
		});
	});

	afterEach(function(done) {
		debug('----afterEach----');

		socket.removeAllListeners();
		socketClose(socket);

		peersController.removeAllListeners();

		socketsController.removeAllListeners()
			.on('socketsControllerDestroyed', function() {
				socketsController.removeAllListeners();
				debug('----afterEach----');
				done();
			})
			.on('socketsControllerAlreadyDestroyed', function() {
				socketsController.removeAllListeners();
				debug('----afterEach----');
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
	var authFunc = function(authData, callback) {
		callback(null, authData.name === 'some');
	}
	var authData = {
		name: 'some'
	}

	beforeEach(function(done) {
		debug('----beforeEach----');
		port++;

		objectsController = new events.EventEmitter();
		socketsController = new SocketsController(port);
		peersController = new PeersController(200, authFunc);

		socketsController.up(peersController);
		peersController.down(socketsController).up(objectsController);

		socketsController.on('socketsControllerReady', function() {
			debug('----beforeEach----');
			done();
		});

		socket = new Socket('http://localhost:' + port, {
			forceNew: true,
			reconnection: false
		});
	});

	afterEach(function(done) {
		debug('----afterEach----');

		objectsController.removeAllListeners();
		peersController.removeAllListeners().destroy();

		socketsController
			.removeAllListeners()
			.on('socketsControllerDestroyed', function() {
				socketsController.removeAllListeners();
				debug('----afterEach----');
				done();
			})
			.on('socketsControllerAlreadyDestroyed', function() {
				socketsController.removeAllListeners();
				debug('----afterEach----');
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
				authData: authData
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
				authData: authData
			}
		});
	});

	it('!peerDisconnectedTimeout && get new peerId', function(done) {
		var token, peerId;

		peersController.on('peerConnection', function(id) {
			socketClose(socket);
		});

		peersController.on('peerDisconnectedTimeout', function(id) {
			assert.equal(id, 0);

			var socket2 = new Socket('ws://localhost:' + port, {
				forceNew: true,
				reconnection: false
			});

			socket2
				.on('message', function(message) {
					assert.deepEqual(message, {
						type: 'internalCallback',
						internalCommand: 'reconnect',
						error: null,
						result: {
							newPeerId: 1,
							newToken: message.result.newToken
						}
					});
					socketClose(socket2);

					done();
				})
				.send({
					type: 'internalCommand',
					internalCommand: 'reconnect',
					args: {
						authData: authData,
						peerId: id,
						token: token
					}
				});
		});

		peersController.on('needObjectsSend', function(_peerId, _token) {
			token = _token;
			peerId = _peerId;
		})

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				authData: authData
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
					done();
				}
			})
			.send({
				type: 'internalCommand',
				internalCommand: 'connect',
				args: {
					authData: authData
				}
			})
	});

	it('!peerReconnection', function(done) {
		var token, peerId;
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
						authData: authData,
						peerId: id,
						token: token
					}
				})
		});

		peersController.on('peerReconnection', function(id) {
			assert.equal(id, 0);

			count.push('peerReconnection');
		});

		peersController.on('needObjectsSend', function(_peerId, _token) {
			token = _token;
			peerId = _peerId;
		});

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				authData: authData
			}
		});
	});

	it('~needPeerSend, while peer disconnected', function(done) {
		var peerId, token;
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
					authData: authData,
					peerId: id,
					token: token
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

		peersController.on('needObjectsSend', function(_peerId, _token) {
			peerId = _peerId;
			token = _token;
		})

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				authData: authData
			}
		});
	});

	it('~needPeersBroadcastSend', function(done) {
		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				authData: authData
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
				authData: authData
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
	var authFunc = function(authData, callback) {
		callback(null, authData.name === 'some');
	}
	var authData = {
		name: 'some'
	}

	beforeEach(function(done) {
		debug('----beforeEach----');

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
		peersController = new PeersController(100, authFunc);

		socketsController.up(peersController).on('socketsControllerReady', function() {
			debug('----beforeEach----');
			done();
		});
		peersController.down(socketsController).up(objectsController);
		objectsController.down(peersController);

		socket = new Socket('http://localhost:' + port, {
			forceNew: true,
			reconnection: false
		});
	});


	afterEach(function(done) {
		debug('----afterEach----');

		objWithFuncAndEvents.removeAllListeners();
		objectsController.removeAllListeners().destroy();
		peersController.removeAllListeners().destroy();

		socketsController
			.removeAllListeners()
			.on('socketsControllerDestroyed', function() {
				socketsController.removeAllListeners();
				debug('----afterEach----');
				done();
			})
			.on('socketsControllerAlreadyDestroyed', function() {
				socketsController.removeAllListeners();
				debug('----afterEach----');
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
				authData: authData
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
					},
					token: message.result.token
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
				authData: authData
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
		var token;

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				authData: authData
			}
		});

		var count = 0;;
		socket.on('message', function(message) {
			count++;

			if (count === 1) {
				token = message.result.token;

				socket.send({
					type: 'command',
					objectName: 'blank',
					methodName: 'simpleFunc',
					args: ['some arg'],
					requestId: 0,
					token: token
				});
			} else if (count === 2) {
				assert.deepEqual(message, {
					type: 'callback',
					objectName: 'blank',
					methodName: 'simpleFunc',
					requestId: 0,
					error: null,
					result: 'some arg'
				});

				done();
			};
		});
	});
})

describe('TeleportServer', function() {
	var objWithFuncAndEvents, teleportServer;
	var socket;
	var authFunc = function(authData, callback) {
		callback(null, authData.name === 'some');
	}
	var authData = {
		name: 'some'
	}

	beforeEach(function(done) {
		debug('----beforeEach----');

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
			},
			authFunc: authFunc
		}).on('ready', function() {
			debug('----beforeEach----');
			done();
		});

		socket = new Socket('http://localhost:' + port, {
			forceNew: true,
			reconnection: false
		});
	});

	afterEach(function(done) {
		debug('----afterEach----');
		objWithFuncAndEvents.removeAllListeners();

		teleportServer.removeAllListeners()
			.on('destroyed', function() {
				teleportServer.removeAllListeners();
				debug('----afterEach----');
				done();
			})
			.on('alreadyDestroyed', function() {
				teleportServer.removeAllListeners();
				debug('----afterEach----');
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
				authData: authData
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
				authData: authData
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
				authData: authData
			}
		});

		socket.on('message', function(message) {
			socketClose(socket);
		})
	})

	it('!clientReconnection', function(done) {
		var token;

		teleportServer.on('clientDisconnection', function(id) {

			var socket2 = new Socket('http://localhost:' + port, {
				forceNew: true,
				reconnection: false
			});

			socket2.send({
				type: 'internalCommand',
				internalCommand: 'reconnect',
				args: {
					authData: authData,
					token: token,
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
				authData: authData
			}
		});

		socket.on('message', function(message) {
			token = message.result.token;
			socketClose(socket);
		})
	})

	it('call command after !clientReconnection', function(done) {
		var token;

		teleportServer.on('clientConnection', function() {
			socketClose(socket);
		}).on('clientDisconnection', function(id) {

			socket = new Socket('http://localhost:' + port, {
				forceNew: true,
				reconnection: false
			});

			socket.send({
				type: 'internalCommand',
				internalCommand: 'reconnect',
				args: {
					authData: authData,
					token: token,
					peerId: id
				}
			})
		}).on('clientReconnection', function(id) {
			socket.send({
				type: 'command',
				objectName: 'blank',
				methodName: 'simpleFunc',
				requestId: 0,
				token: token,
				args: ['nyan']
			});

			var messageCount = 0;
			socket.on('message', function(message) {
				messageCount++;

				if (messageCount === 2) {
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
				authData: authData,
			}
		}).on('message', function(message) {
			token = message.result.token;
		});
	})

	it('emit event after !clientReconnection', function(done) {
		var token;

		teleportServer.on('clientConnection', function() {
			socketClose(socket);
		}).on('clientDisconnection', function(id) {

			socket = new Socket('http://localhost:' + port, {
				forceNew: true,
				reconnection: false
			});

			socket.send({
				type: 'internalCommand',
				internalCommand: 'reconnect',
				args: {
					authData: authData,
					token: token,
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
				authData: authData
			}
		}).on('message', function(message) {
			token = message.result.token;
		})
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
				authData: authData
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