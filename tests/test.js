var SocketsController = require('../libs/SocketsController');
var PeersController = require('../libs/PeersController');

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
			socket.on('message', function() {
				done();
			});

			objectsController.emit('needPeerSend', id, 'hello');
		})
	});

	it('!peerReconnect', function(done) {
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

		peersController.on('peerDisconnect', function() {
			var socket = new Socket('ws://localhost:' + port);
		});

		peersController.on('peerReconnect', function() {
			done();
		})
	})
})