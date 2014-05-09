"use strict"

//require
var WebSocketServer = require('ws').Server;
var util = require('util');
var events = require("events");
//end require

module.exports = TeleportServer;

util.inherits(TeleportServer, events.EventEmitter);

function TeleportServer(options) {
	//options
	this._optionIsDebug = options.isDebug;
	this._optionWsServerPort = options.port;
	this._optionObjects = options.objects;

	//end options

	//variables
	this._valueWsPers = [];
	this._valueWsServer = null;

	this._valueIsInit = false;

	//end variables
}


TeleportServer.prototype.init = function() {
	if (!this._valueIsInit) {
		this._funcWsServerInit();
		this._funcEmitterInit();

		this._valueIsInit = true;
	}

	return this;
};

//emitter
TeleportServer.prototype._funcEmitterInit = function() {
	Object.keys(this._optionObjects).forEach(function(objectName) {
		var object = this._optionObjects[objectName].object;
		var events = this._optionObjects[objectName].events;

		var vanillaEmit = object.emit;
		object.emit = function(event, args) {
			var isEventTeleporting = events.indexOf(event) != -1;

			if (this._optionIsDebug) this.emit("debug", {
				desc: "TeleportServer: зарегистрированный объект выбросил событие.",
				objectName: objectName,
				event: event,
				isEventTeleporting: isEventTeleporting,
				permitEvents: events
			});

			if (isEventTeleporting) {
				this._funcWsSendBroadcast({
					objectName: objectName,
					type: "event",
					event: event,
					args: args
				});
			}

			vanillaEmit.apply(object, arguments);
		}.bind(this);
	}.bind(this));
};


//end emitter

//message hadlers
TeleportServer.prototype._funcCommandHandler = function(ws, message) {
	if (!this._optionObjects[message.objectName] || (this._optionObjects[message.objectName].methods.indexOf(message.command) == -1)) {
		var errorInfo = ({
			desc: "TeleportServer: попытка вызвать незарегистророванную функцию",
			message: message
		});

		this._funcWsSend(ws, {
			objectName: message.objectName,
			type: "callback",
			command: message.command,
			requestId: message.requestId,
			error: errorInfo
		});

		this.emit("error", errorInfo);
	} else {
		var callback = commandCallbackCreate(message).bind(this);
		if (!message.args) {
			this._optionObjects[message.objectName].object[message.command](callback);
		} else {
			this._optionObjects[message.objectName].object[message.command](message.args, callback);
		}
	}

	//	helpers
	function commandCallbackCreate(req) {
		return function(error, result) {
			var resultToSend = {
				objectName: req.objectName,
				type: "callback",
				command: req.command,
				requestId: req.requestId,
				error: error,
				result: result,
			};

			this._funcWsSend(ws, resultToSend);
		};
	};

	//	end helpers
};


TeleportServer.prototype._funcInternalCommandHandler = function(ws, message) {
	if (message.internalCommand == "getObjects") {

		var resultObjects = {};
		for (var objectName in this._optionObjects) {
			resultObjects[objectName] = {
				methods: this._optionObjects[objectName].methods
			}
		}

		var result = {
			type: "internalCallback",
			internalCommand: message.internalCommand,
			error: null,
			result: resultObjects
		};

		this._funcWsSend(ws, result);
	} else {
		var errorInfo = ({
			desc: "TeleportServer: поступила неожиданная сервисная команда",
			message: message
		});

		this._funcWsSend(ws, {
			type: "internalCallback",
			internalCommand: message.internalCommand,
			error: errorInfo
		});

		this.emit("error", errorInfo);
	}
};

//end message handlers

//wss
TeleportServer.prototype._funcWsServerInit = function() {
	this._valueWsServer = new WebSocketServer({
		port: this._optionWsServerPort
	});

	this._valueWsServer.on('error', function(error) {
		this.emit("error", {
			desc: "TeleportServer: Web Socket сервер выбросил ошибку.",
			error: error
		});
	}.bind(this));

	this._valueWsServer.on('connection', function(ws) {
		var index = this._valueWsPers.length;
		this._valueWsPers[index] = ws;

		ws.on('message', this._funcWsOnMessageCreate(ws).bind(this));
		ws.on('error', function(err) {
			if (this._optionIsDebug) this.emit('debug', {
				desc: "Произошла ошибка соединения с пиром",
				error: err
			});
		}.bind(this));
		ws.on('close', this._funcWsClosedCreate(index).bind(this));
	}.bind(this));

	this._valueWsServer.on('listening', function() {
		var info = {
			desc: "TeleportServer: Ws Server - запущен",
			port: this._optionWsServerPort
		};

		this.emit('info', info);
		this.emit('listening');
	}.bind(this));
};

TeleportServer.prototype._funcWsSendBroadcast = function(message) {
	this._valueWsPers.forEach(function(ws) {
		if (ws) {
			this._funcWsSend(ws, message);
		}
	}.bind(this));
};

TeleportServer.prototype._funcWsSend = function(ws, message) {
	ws.send(
		JSON.stringify(message),
		wsSendedCreate(message).bind(this));

	function wsSendedCreate(toSend) {
		return function(error) {
			if (error) {
				if (this._optionIsDebug) this.emit('debug', {
					desc: "TeleportServer: Во время отправки сообщения пиру произошла ошибка.",
					error: error,
					toSend: toSend
				});
			} else {
				if (this._optionIsDebug) this.emit('debug', {
					desc: "TeleportServer: Отправка сообщения пиру прошла успешно.",
					type: toSend.type,
					command: toSend.command,
					internalCommand: toSend.internalCommand,
					event: toSend.event
				});
			}
		};
	};
};


TeleportServer.prototype._funcWsClosedCreate = function(index) {
	return function() {
		delete this._valueWsPers[index];
	};
};

TeleportServer.prototype._funcWsOnMessageCreate = function(ws) {
	return function(sourceMessage) {
		var message = JSON.parse(sourceMessage);

		if (this._optionIsDebug) this.emit('debug', {
			desc: "TeleportServer: принято соощение от пира.",
			message: message
		});

		if (message.type == "command") {
			this._funcCommandHandler(ws, message);
		} else if (message.type == "internalCommand") {
			this._funcInternalCommandHandler(ws, message);
		} else {
			var errorInfo = ({
				desc: "TeleportServer: для данного типа сообщений нет хэндлера",
				message: message
			});

			this.emit("error", errorInfo);
		}
	};
};

//end wss