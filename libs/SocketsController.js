/*
	Events:
		
		serverReady
		serverError

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

var Winston = require('winston');
var logger = new(Winston.Logger)({
	transports: [
		new(Winston.transports.Console)({
			timestamp: true,
			level: 'debug',
			colorize: true
		})
	]
});

module.exports = SocketsController;

util.inherits(SocketsController, events.EventEmitter);

function SocketsController(_port) {
	this._port = _port;
	this._wsServer = null;
	this._wsList = {};
	this._isServerEmitedError = false;
	this._httpServer = this._createHttpServer(_port);

	this._init(this._httpServer);
	this._initAsyncEmit();
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

		logger.debug('ws, id: %s - !socketConnection', socketId);
		this._wsList[socketId] = ws;

		this.emit('socketConnection', socketId);

		ws.on('message', function(data) {
			logger.debug('ws, id: %s - !socketMessage: ', socketId, data);

			this.emit('socketMessage', socketId, data);
		}.bind(this));

		ws.on('error', function(error) {
			logger.error('ws, id %s - !socketError: ', socketId, error);

			this.emit('socketError', error);
		})

		ws.on('disconnect', function() {
			logger.debug('ws, id: %s - !socketDisconnect', socketId);

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
		logger.info('HttpServer, port: %d - !serverReady', port);

		this.emit('serverReady');
	}.bind(this))

	srv.on('error', function(error) {
		logger.error('HttpServer, port: %d - !serverError: ', port, error);

		this._isServerEmitedError = true;
		this.emit('serverError', error);
	}.bind(this));

	srv.on('close', function() {
		logger.info('HttpServer, port: %d - !serverClose', port);

		this.emit('serverClose');
	});

	srv.listen(port);

	return srv;
}

SocketsController.prototype.close = function() {
	this._httpServer.close();
	this._wsServer.eio.ws.close();

	return this;
}

SocketsController.prototype.up = function(peersController) {

	peersController.on('needSocketSend', function(id, message) {
		var ws = this._wsList[id];
		if (!ws) return logger.warn('ws, id %s - ~needSocketSend, id not found, message: %s', id, message);

		logger.debug('ws, id %s - ~needSocketSend, message: ', id, message);
		ws.send(message);
	}.bind(this));

	return this;
}