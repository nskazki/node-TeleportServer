"use strict"

//require
var WebSocketServer = require('ws').Server;
var util = require('util');
var events = require("events");
//end require

module.exports = TeleportServer;

util.inherits(TeleportServer, events.EventEmitter);


/**
 * RPC сервер, умеет вызывать методы серверных объектов и сообщать подключенным клиентом о выбрасываемых объектами событиях
 * <br>
 * Конструктор класса TeleportServer, принимает единственным параметром объект с опциями,<br>
 *  возвращает новый неинециализированный объект класса TeleportServer
 *
 * @author nskazki@gmail.com
 * @version 0.1.2
 *
 * @constructor
 *
 * @param options {Object} - parameters to initialize the class
 * @param options.isDebug {Boolean} - if true, the object will emit debug events.
 * @param options.port {Number} - port that the server will listen.
 * @param options.objects {Object}
 * @param options.objects.someObjectName {Object}
 * @param options.objects.someObjectName.object {Object}
 * @param options.objects.someObjectName.methods {Array.<string>}
 * @param options.objects.someObjectName.events {Array.<string>}
 *
 * @example
 * var teleportServer = new TeleportServer({
 * 	objects: {
 * 		'logBox': {
 * 			object: logBox,
 * 			methods: ['getDateBounds', 'getLogs'],
 * 			events: ['newDateBounds']
 * 		},
 * 		'ipBox': {
 * 			object: ipBox,
 * 			methods: ['getIps'],
 * 			events: ['newIps']
 * 		}
 * 	},
 * 	port: 8000,
 * 	isDebug: false
 * }).on('error', function(error) {
 * 	errorLogger('teleportServer - error', error);
 * }).on('warnLogger', function(warn) {
 * 	warnLogger('teleportServer - warn', warn);
 * }).on('info', function(info) {
 * 	ingoLogger('teleportServer - info', info);
 * }).on('debug', function(bebug) {
 * 	debugLogger('teleportServer - bebug', bebug);
 * }).init();
 *
 */
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

/**
 * Инициализирующий метод, вызывающий приватный инициализирующие методы класса.<br>
 *  А имеенно создает web socket сервер и выполняет monkey patching EventEmittera переданных в опциях объектов.
 *
 * @public
 *
 */
TeleportServer.prototype.init = function() {
	if (!this._valueIsInit) {
		this._funcWsServerInit();
		this._funcEmitterInit();

		this._valueIsInit = true;
	}

	return this;
};

//emitter
/**
 * Приватный инициализирующий метод, выполняющий monkey patching EventEmitter-a
 *  переданных в опциях объектов (options.objects.someObjectName.object).
 *
 * Сохраняет и подменяет оригинальный object.emit метод,
 *  в подменненном происходит обработка всех выбрасываемых объектом событий.
 *
 * А именно если тип события входит в массив разрешенных (options.objects.someObjectName.events),
 *  то информация о имени объекта возбудившего событие (options.objects.someObjectName),
 *  тип и аргументы события передаются RPC клиенту, вызовом метода this._funcWsSendBroadcast
 *
 * Также если isDebug == true, то подписчики события 'debug' объекта класса TeleportServer
 *  получат информацю о типе события и имя объекта его возбудившего,
 *  а также признак входит ли это событие в список разрешенных.
 *
 * @private
 * @this TeleportServer
 */
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
/**
 * Приватный метод, который будет выздан анонимной функцией создоваемой методом this._funcWsOnMessageCreate,
 *  который в свою очередь вызывается когда ws server создает с пиром новое соединение.
 *  этот метод будет вызванн если в объекте message есть поле command.
 *
 * В этой функции из объекта message извлекается информации о message.objectName к которому происходит обращение,
 *  message.command (методе объекта), и аргументах передаваемых в метод - message.args.
 *
 * Если объект зарегистрирован в options.objects.someObjectName, и метод зарегистророванн в options.objects.someObjectName.methods
 *  то соответствующий метод, соответствующего объекта будет вызван c message.args (если есть), и созданным методом
 *  this.commandCallbackCreate каллбеком, который через замыкание будет иметь доступ к ws (соединению с пиром), и принятому запросу (message).
 *  и собственно этот анонимный каллбек и вернет результат работы метода клиенту, вызвав метод this._funcWsSend.
 *
 * Если объект или метод объекта не зарегистрированны, то клиенту будет возвращена ошибка, причем вернуться она калбек функции которая
 *  этот незарегистрированный метод вызвала на стороне клиента. Возвращается также вызовом метода this._funcWsSend
 *
 * @private
 * @this TeleportServer
 *
 * @param ws {Object} - object contains a connection to the client.
 * @param message {Object} - message received from the client, containing the information about the asynchronous command to execute.
 * @param message.objectName {string} - name of the object whose method is to be called.
 * @param message.command {string} - the name of the method being called.
 * @param message.args {*=} - argument to be passed to the called method.
 * @param message.requestId {Number} - serial number of commands sent by rpc client.
 *
 * @return anonymous {Object} - object containing the result of the command.
 * @return anonymous.objectName {string} - name of the object whose method is to be called.
 * @return anonymous.type {string} - type of message.
 * @return anonymous.command {string} - the name of the method being called.
 * @return anonymous.requestId {Number} - serial number of commands sent by rpc client.
 * @return anonymous.error {*=} - error arose as a result of the called function.
 * @return anonymous.result {*=} - result arose as a result of the called function.
 *
 */
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
	function commandCallbackCreate() {
		return function(error, result) {
			var resultToSend = {
				objectName: message.objectName,
				type: "callback",
				command: message.command,
				requestId: message.requestId,
				error: error,
				result: result,
			};

			this._funcWsSend(ws, resultToSend);
		};
	};

	//	end helpers
};

/**
 * Приватный метод, который будет выздан анонимной функцией создоваемой методом this._funcWsOnMessageCreate,
 *  который в свою очередь вызывается когда ws server создает с пиром новое соединение.
 *  этот метод будет вызванн если в объекте message есть поле internalCommand.
 *
 * Если тип internalCommand зарегестрированн, то команда будет выполненна
 *  и результат вернуться клиенту функцией this._funcWsSend
 *
 * Если тип команды не зарегистророван то будет клиенту будет возвращена ошибка.
 *
 * @private
 * @this TeleportServer
 *
 * @param ws {Object} - object contains a connection to the client.
 * @param message {Object} - message received from the client, containing the information about the internalCommand to execute.
 * @param message.internalCommand {string} - the name of the internalCommand being called.
 *
 * @return anonymous {Object} - object containing the result of the internalCommand.
 * @return anonymous.type {string} - type of message.
 * @return anonymous.internalCommand {string} - the name of the internalCommand.
 * @return anonymous.error {*=} - error arose as a result of the called function.
 * @return anonymous.result {*=} - result arose as a result of the called function.
 *
 */
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