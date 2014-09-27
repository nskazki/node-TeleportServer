/*
	Events:
		
		socketsControllerReady
		socketsControllerError
		socketsControllerDestroyed
		socketsControllerAlreadyDestroyed

		socketConnection
		socketMessage
		socketDisconnection
		socketError

	Listenings:

		up:
			needSocketSend
			needSocketClose
*/

'use stricts';

var WebSocketServer = require('socket.io');

var http = require('http');
var util = require('util');
var events = require('events');

var debug = require('debug')('TeleportServer:SocketsController');

module.exports = SocketsController;

util.inherits(SocketsController, events.EventEmitter);

function SocketsController(_port) {
	this._port = _port;
	this._socketsServer = null;
	this._socketsList = {};
	this._httpServer = this._createHttpServer();

	this._init();

	this._isInit = true;
}

SocketsController.prototype.destroy = function() {
	debug('SocketsController#destroy -> init destroy process');

	if (this._isInit === true) {
		this._isInit = false;

		for (var wsId in this._socketsList) {
			if (this._socketsList.hasOwnProperty(wsId) && this._socketsList[wsId]) {
				var ws = this._socketsList[wsId];
				ws.removeAllListeners().disconnect();
			}
		}

		setTimeout(function() {
			this.close();
		}.bind(this), 200);

		//console.log('method #destroy in class SocketsController - not work.');
		//console.log('because method #close not work in socket.io.');
		//console.log('i jast can send to peers "disconnect" message.')
		//console.log('im sorry');

	} else {
		debug('server already destroyed -> !socketsControllerAlreadyDestroyed');

		this.emit('socketsControllerAlreadyDestroyed');
	}

	return this;
}

SocketsController.prototype._init = function() {
	//wss
	this._socketsServer = new WebSocketServer(this._httpServer);

	//end wss

	//ws
	this._socketsServer.sockets.on('connection', function(ws) {
		var socketId = ws.id;

		debug('socketId: %s - ~connection -> add socket to _socketsList &&  !socketConnection', socketId);
		this._socketsList[socketId] = ws;

		this.emit('socketConnection', socketId);

		ws.on('message', function(message) {
			debug('socketId: %s - ~message -> !socketMessage,\n\t message: %j', socketId, message);

			this.emit('socketMessage', socketId, message);
		}.bind(this));

		ws.on('error', function(error) {
			debug('socketId: %s - ~error -> !socketError,\n\t error %s', socketId, error.toString());

			this.emit('socketError', error);
		})

		ws.on('disconnect', function() {
			debug('socketId: %s - ~disconnect -> remove from _socketsList && !socketDisconnection', socketId);

			ws.removeAllListeners();
			delete this._socketsList[socketId];

			this.emit('socketDisconnection', socketId);
		}.bind(this));

	}.bind(this));

	//end ws

	return this;
}

SocketsController.prototype._createHttpServer = function() {
	var srv = http.Server(function(req, res) {
		res.writeHead(404);
		res.end();
	});

	srv.on('listening', function() {
		debug('HttpServer, port: %d - !socketsControllerReady', this._port);

		this.emit('socketsControllerReady');
	}.bind(this))

	srv.on('error', function(error) {
		debug('HttpServer, port: %d - !socketsControllerError: %s', this._port, error.toString());

		this.emit('socketsControllerError', error);
	}.bind(this));

	srv.on('close', function() {
		debug('HttpServer, port: %d - !serverClose', this._port);

		this.emit('serverClose');
	});

	srv.listen(this._port);

	return srv;
}

SocketsController.prototype.close = function() {
	var count = [];
	var isEmited = false;

	try {
		this._httpServer.removeAllListeners();

		this._httpServer.on('close', function() {
			debug('httpServer port: %d - ~close -> !serverClose', this._port);
			updateAndCheckCount.bind(this)('httpServer');
		}.bind(this)).close();

	} catch (ex) {
		debug('httpServer port: %d - #close error: %s', this._port, ex.toString());
		updateAndCheckCount.bind(this)('httpServer');
	}

	try {
		this._socketsServer.eio.ws._server
			.on('close', function() {
				debug('wsServer port: %d - ~close -> !serverClose', this._port);
				updateAndCheckCount.bind(this)('wsServer');
			}.bind(this))
			.close();
	} catch (ex) {
		debug('wsServer port: %d - #close error: %s', this._port, ex.toString());
		updateAndCheckCount.bind(this)('wsServer');
	}

	setTimeout(function() {
		if (isEmited === false) {
			debug('destroy process not end, but 500 ms elapse -> !socketsControllerDestroyed');

			isEmited = true;
			this.emit('socketsControllerDestroyed');
		}
	}.bind(this), 1500);

	return this;

	function updateAndCheckCount(name) {
		count.push(name);
		if ((count.length == 2) && (isEmited === false)) {
			debug('destroy process end -> !socketsControllerDestroyed');

			isEmited = true;
			this.emit('socketsControllerDestroyed');
		}
	}
}

SocketsController.prototype.up = function(peersController) {

	peersController.on('needSocketSend', function(id, message) {
		var ws = this._socketsList[id];
		if (!ws) return debug('socketId: %s - ~needSocketSend, id not found,\n\t message: %j', id, message);

		debug('socketId: %s - ~needSocketSend -> #send,\n\t message: %j', id, message);
		ws.send(message);
	}.bind(this));

	peersController.on('needSocketClose', function(id) {
		var ws = this._socketsList[id];
		if (!ws) return debug('socketId: %s - ~needSocketClose, id not found', id);

		debug('socketId: %s - ~needSocketClose -> close', id);
		ws.removeAllListeners().disconnect();
	}.bind(this));

	return this;
}