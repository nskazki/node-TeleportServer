/*
	Events:
		
		serverReady
		serverError
		serverDestroyed

		socketConnection
		socketMessage
		socketDisconnect
		socketError

	Listenings:

		up:
			needSocketSend

	Public:

		up
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
	this._wsServer = null;
	this._wsList = {};
	this._httpServer = this._createHttpServer(_port);

	this._init(this._httpServer);
	this._initAsyncEmit();
}

SocketsController.prototype.destroy = function() {
	debug('ws, id: all - #destroy, server destroyed');

	for (var wsId in this._wsList) {
		if (this._wsList.hasOwnProperty(wsId)) {
			var ws = this._wsList[wsId];
			ws.removeAllListeners().disconnect();
		}
	}

	setTimeout(function() {
		this.close();

		this._port = null;
		this._wsServer = null;
		this._wsList = null;
		this._httpServer = null;

		this.emit('serverDestroyed');

	}.bind(this), 100);

	return this;
}

SocketsController.prototype._initAsyncEmit = function() {
	var vanullaEmit = this.emit;
	this.emit = function() {
		var asyncArguments = arguments;

		process.nextTick(function() {
			vanullaEmit.apply(this, asyncArguments);
		}.bind(this));
	}.bind(this);
}

SocketsController.prototype._init = function(_httpServer) {
	//wss
	this._wsServer = new WebSocketServer(_httpServer);

	//end wss

	//ws
	this._wsServer.sockets.on('connection', function(ws) {
		var socketId = ws.id;

		debug('ws, id: %s - !socketConnection', socketId);
		this._wsList[socketId] = ws;

		this.emit('socketConnection', socketId);

		ws.on('message', function(data) {
			debug('ws, id: %s - !socketMessage: %j', socketId, data);

			this.emit('socketMessage', socketId, data);
		}.bind(this));

		ws.on('error', function(error) {
			debug('ws, id %s - !socketError: %s', socketId, error.toString());

			this.emit('socketError', error);
		})

		ws.on('disconnect', function() {
			debug('ws, id: %s - !socketDisconnect', socketId);

			ws.removeAllListeners();
			delete this._wsList[socketId];
			this.emit('socketDisconnect', socketId);
		}.bind(this));

	}.bind(this));

	//end ws

	return this;
}

SocketsController.prototype._createHttpServer = function(port) {
	var srv = http.Server(function(req, res) {
		res.writeHead(404);
		res.end();
	});

	srv.on('listening', function() {
		debug('HttpServer, port: %d - !serverReady', port);

		this.emit('serverReady');
	}.bind(this))

	srv.on('error', function(error) {
		debug('HttpServer, port: %d - !serverError: %s', port, error.toString());

		this.emit('serverError', error);
	}.bind(this));

	srv.on('close', function() {
		debug('HttpServer, port: %d - !serverClose', port);

		this.emit('serverClose');
	});

	srv.listen(port);

	return srv;
}

SocketsController.prototype.close = function() {
	try {
		this._httpServer.removeAllListeners().close();
	} catch (ex) {
		debug('serverClose - Error: ', ex.toString());
	}

	try {
		this._wsServer.eio.ws.removeAllListeners().close();
	} catch (ex) {
		debug('serverClose - Error: ', ex.toString());
	}

	return this;
}

SocketsController.prototype.up = function(peersController) {

	peersController.on('needSocketSend', function(id, message) {
		var ws = this._wsList[id];
		if (!ws) return debug('ws, id %s - ~needSocketSend, id not found, message: %j', id, message);

		debug('ws, id %s - ~needSocketSend, message: %j', id, message);
		ws.send(message);
	}.bind(this));

	return this;
}