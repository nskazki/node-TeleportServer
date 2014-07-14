var SocketsController = require('../libs/SocketsController');
var PeersController = require('../libs/PeersController');
var ObjectsController = require('../libs/ObjectsController');

var assert = require('assert');

var WebSocketServerMock = require('./WebSocketServerMock');
var WsMock = require('./WsMock');
var Socket = require('socket.io-client');

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
	beforeEach(function() {
		port++;
	});

	it('#new - server emited ready', function(done) {
		var socketsController = new SocketsController(port);

		socketsController.on('serverReady', done);
		socketsController.on('serverError', done);
	});

	it('#new - server emited error', function(done) {
		var socketsController = new SocketsController(port - 1);

		socketsController.on('serverReady', function() {
			done(new Error('server init on used port'));
		});
		socketsController.on('serverError', function() {
			done();
		});
	});

	it('#close - two server, one port', function(done) {
		var socketsController = new SocketsController(port);
		socketsController.close();

		socketsController = new SocketsController(port);
		socketsController.on('serverReady', done);
		socketsController.on('serverError', done);
	});

	it('!socketConnection', function(done) {
		var socketsController = new SocketsController(port);
		var socket = new Socket('http://localhost:' + port);

		socketsController.on('socketConnection', function(id) {
			done();
		});
	});

	it('!socketMessage', function(done) {
		var socketsController = new SocketsController(port);
		var socket = new Socket('http://localhost:' + port);

		var messageToSend = {
			hello: 'world!'
		};
		socket.send(messageToSend);

		socketsController.on('socketMessage', function(id, message) {
			assert.deepEqual(message, messageToSend);
			done();
		});
	});

	it('!socketDisconnect', function(done) {
		var socketsController = new SocketsController(port);

		socketsController.on('serverReady', function() {
			var socket = new Socket('http://localhost:' + port);
			socket.on('connect', function() {
				socket.disconnect();
			});
		});

		socketsController.on('socketDisconnect', function(id) {
			done();
		});
	});

	it('!socketDisconnect x2', function(done) {
		var socketsController = new SocketsController(port);

		socketsController.on('serverReady', function() {
			var socket = new Socket('http://localhost:' + port);


			socket.on('connect', function() {
				socket.send('some test');
			});

			socketsController.on('socketMessage', function() {
				socketClose(socket);
			});

		});

		socketsController.on('socketDisconnect', function(id) {
			done();
		});
	});

	it('~needSocketSend', function(done) {
		var socketsController = new SocketsController(port);
		var socket = new Socket('http://localhost:' + port);

		var peersController = new events.EventEmitter();
		socketsController.up(peersController);

		socketsController.on('socketConnection', function(id) {
			socket.on('message', function() {
				done();
			});

			peersController.emit('needSocketSend', id, 'hello');
		})
	})
});

describe('PeersController', function() {
	beforeEach(function() {
		port++;
	});

	it('#new', function() {
		var peersController = new PeersController();
	})

	it('#down', function() {
		var socketsController = new SocketsController(port);
		var peersController = new PeersController().down(socketsController);
	});

	it('!peerConnection', function(done) {
		var socketsController = new SocketsController(port);
		var peersController = new PeersController().down(socketsController);
		socketsController.up(peersController);

		var socket = new Socket('ws://localhost:' + port);
		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});

		peersController.on('peerConnection', function() {
			done();
		});
	});

	it('!peerDisconnectedTimeout', function(done) {
		var socketsController = new SocketsController(port);
		var peersController = new PeersController().down(socketsController);
		var socket = new Socket('ws://localhost:' + port);

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});

		peersController.on('peerConnection', function(id) {
			socketClose(socket);
		});

		peersController.on('peerDisconnectedTimeout', function() {
			done();
		});
	});

	it('!peerDisconnectedTimeout && fail reconnect atempt', function(done) {
		var socketsController = new SocketsController(port);
		var peersController = new PeersController().down(socketsController);
		socketsController.up(peersController);

		var socket = new Socket('ws://localhost:' + port);
		var clientTimestamp = new Date().valueOf();

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: clientTimestamp
			}
		});

		peersController.on('peerConnection', function(id) {
			socketClose(socket);
		});

		peersController.on('peerDisconnectedTimeout', function(id) {
			var socket = new Socket('ws://localhost:' + port, {
				forceNew: true
			});

			socket.send({
				type: 'internalCommand',
				internalCommand: 'reconnect',
				args: {
					clientTimestamp: clientTimestamp,
					peerId: id
				}
			});

			socket.on('message', function(message) {
				if (message.error) done();
			})
		});
	});

	it('~needPeerSend', function(done) {
		var socketsController = new SocketsController(port);
		var peersController = new PeersController();
		var objectsController = new events.EventEmitter();

		socketsController.up(peersController);
		peersController.down(socketsController).up(objectsController);

		var socket = new Socket('http://localhost:' + port);
		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});

		peersController.on('peerConnection', function(id) {
			socket.on('message', function(message) {
				if (message == 'hello') done();
			});

			objectsController.emit('needPeerSend', id, 'hello');
		})
	});

	it('!peerReconnect', function(done) {
		var socketsController = new SocketsController(port);
		var peersController = new PeersController().down(socketsController);
		socketsController.up(peersController);

		var socket = new Socket('ws://localhost:' + port);
		var clientTimestamp = new Date().valueOf();

		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: clientTimestamp
			}
		});

		var count = [];

		peersController.on('peerConnection', function(id) {
			socketClose(socket);
		});

		peersController.on('peerDisconnect', function(id) {
			var socket = new Socket('ws://localhost:' + port, {
				forceNew: true
			});

			socket.send({
				type: 'internalCommand',
				internalCommand: 'reconnect',
				args: {
					clientTimestamp: clientTimestamp,
					peerId: id
				}
			});

			socket.on('message', function() {
				count.push('message');
				if (count.length == 2) done();
			})
		});

		peersController.on('peerReconnect', function() {
			count.push('peerReconnect');
			if (count.length == 2) done();
		});
	});

	it('~needPeerSend, while peer disconnected', function(done) {
		var socketsController = new SocketsController(port);
		var peersController = new PeersController();
		var objectsController = new events.EventEmitter();

		var clientTimestamp = new Date().valueOf();

		socketsController.up(peersController);
		peersController.down(socketsController).up(objectsController);

		var socket = new Socket('http://localhost:' + port);
		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: clientTimestamp
			}
		});

		var count = [];

		peersController.on('peerConnection', function(id) {
			socketClose(socket);
		});

		peersController.on('peerDisconnect', function(id) {
			objectsController.emit('needPeerSend', id, 'hello :)');

			var socket = new Socket('ws://localhost:' + port, {
				forceNew: true
			});

			socket.send({
				type: 'internalCommand',
				internalCommand: 'reconnect',
				args: {
					clientTimestamp: clientTimestamp,
					peerId: id
				}
			});

			socket.on('message', function() {
				count.push('message');
				if (count.length == 3) done();
			})
		});

		peersController.on('peerReconnect', function() {
			count.push('peerReconnect');
			if (count.length == 3) done();
		});
	});

	it('~needPeersBroadcastSend', function(done) {
		var socketsController = new SocketsController(port);
		var peersController = new PeersController();
		var objectsController = new events.EventEmitter();

		socketsController.up(peersController);
		peersController.down(socketsController).up(objectsController);

		var socket = new Socket('http://localhost:' + port);
		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});

		peersController.on('peerConnection', function(id) {
			socket.on('message', function(message) {
				if (message == 'hello') done();
			});

			objectsController.emit('needPeersBroadcastSend', 'hello');
		})
	});



	it('!peerDisconnect', function(done) {
		var socketsController = new SocketsController(port);
		var peersController = new PeersController().down(socketsController);
		var socket = new Socket('ws://localhost:' + port);

		socket.on('connect', function() {
			socket.send({
				type: 'internalCommand',
				internalCommand: 'connect',
				args: {
					clientTimestamp: new Date().valueOf()
				}
			});
		});

		peersController.on('peerConnection', function() {
			socketClose(socket);
		});
		peersController.on('peerDisconnect', function() {
			done();
		})
	});
});

describe('ObjectsController', function() {
	beforeEach(function() {
		port++;
	});

	it('#new', function() {
		var objectsController = new ObjectsController({
			'blank': {
				object: new ClassWithFuncAndEvents(),
				methods: ['simpleFunc'],
				events: ['simpleEvent']
			}
		});
	});

	it('command', function(done) {
		var objectsController = new ObjectsController({
			'blank': {
				object: new ClassWithFuncAndEvents(),
				methods: ['simpleFunc'],
				events: ['simpleEvent']
			}
		});
		var socketsController = new SocketsController(port);
		var peersController = new PeersController();

		socketsController.up(peersController);
		peersController.down(socketsController).up(objectsController);
		objectsController.down(peersController);

		var socket = new Socket('http://localhost:' + port);
		socket.send({
			type: 'internalCommand',
			internalCommand: 'connect',
			args: {
				clientTimestamp: new Date().valueOf()
			}
		});

		socket.send({
			type: 'command',
			object: 'blank',
			command: 'simpleFunc',
			args: ['some arg'],
			requestId: 0
		});

		var count = 0;;
		socket.on('message', function() {
			count++;
			if (count == 2) done();
		});
	});
})

//
util.inherits(ClassWithFuncAndEvents, events.EventEmitter);

function ClassWithFuncAndEvents() {}

ClassWithFuncAndEvents.prototype.simpleFunc = function(arg, callback) {
	callback(null, arg);
};