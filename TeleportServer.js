"use strict";

//require
var WebSocketServer = require('ws').Server;
var util = require('util');
var events = require('events');
var _ = require('underscore');

//end require

module.exports = TeleportServer;

util.inherits(TeleportServer, events.EventEmitter);


/**
	Это PC сервер, умеет вызывать методы серверных объектов и сообщать подключенным клиентом 
	о выбрасываемых объектами событиях.

	Конструктор класса TeleportServer, принимает единственным параметром объект с опциями,
	возвращает новый неинециализированный объект класса TeleportServer
	options = {
		port: 8000,
		isDebug: true,
		objects: {
			'simpleObject': {
				object: simpleObject,
				methods: 'simpleAsyncFunc',
				events: 'myOptions'
			}
		}
	}
	
	формат инициалируемых полей
	this._valueWsServer - поле которое будет проиницилизированно методом _funcWsServerInit, 
	в него будет записанна ссылка на экземпляр web socket server.

*/
function TeleportServer(options) {
	//options
	this._optionIsDebug = options.isDebug;
	this._optionWsServerPort = options.port;
	this._optionObjects = options.objects;

	//end options

	//variables
	this._valueWsServer = null;
	this._valueIsInit = false;

	//end variables
}

/**
	Инициализирующий метод, вызывающий приватный инициализирующие методы класса.
	А имеенно, создает web socket сервер и выполняет monkey patching EventEmitter-a переданных в опциях объектов.
	
*/
TeleportServer.prototype.init = function() {
	if (!this._valueIsInit) {
		this._funcWsServerInit();
		this._funcEmitterInit();

		this._valueIsInit = true;
	}

	return this;
};

/**
	Метод деструктор.
	Закрывает WebSocket Server, разрывает все соединения с пирами - метод this._valueIsInit.close()
	Снимает всех подписчиков с WSS
	Восстанавливает метод emit у всех серверных объектов у которых он выл подменен
	Выбрасывает последние `info` and `close` и удалеет всех подписчиков на собития this
	И в конце ставить флаг "не инициализирован" this._valueIsInit = false

	isError - флаг указывающий прикращена ли работа сервера в следствии ошибки или штатно.

*/
TeleportServer.prototype.destroy = function(isError) {
	if (this._valueIsInit) {
		this._valueWsServer.close();

		this._valueWsServer
			.removeAllListeners('listening')
			.removeAllListeners('error')
			.removeAllListeners('connection');

		for (var objName in this._optionObjects) {
			var object = this._optionObjects[objName].object;

			if (object.emit && object.__vanillaEmit__) {
				object.emit = object.__vanillaEmit__;
				delete object.__vanillaEmit__;
			}
		}

		if (isError) {
			this.emit('error', {
				desc: 'TeleportServer: Работа сервера прекращена в следствии ошибки, все соединения разорванны, подписчики на серверные события будут пудаленны.'
			})
		} else {
			this.emit('info', {
				desc: 'TeleportServer: Работа сервера штатно прекращена, все соединения с пирами разорванны, подписчики на серверные события будут удаленны.'
			});
		}


		this.emit('close');

		this
			.removeAllListeners('error')
			.removeAllListeners('warn')
			.removeAllListeners('info')
			.removeAllListeners('debug')
			.removeAllListeners('ready')
			.removeAllListeners('close')
			.removeAllListeners('newClientConnected');

		this._valueIsInit = false;
	}

	return this;
}

//emitter
/**
	Приватный инициализирующий метод, выполняющий monkey patching EventEmitter-a
	переданных в опциях объектов (options.objects.someObjectName.object).
	
	Сохраняет и подменяет оригинальный object.emit метод,
	в подменненном происходит обработка всех выбрасываемых объектом событий.
	
	А именно если тип события входит в массив разрешенных (options.objects.someObjectName.events),
	то информация о имени объекта возбудившего событие (options.objects.someObjectName),
	тип и аргументы события передаются RPC клиенту, вызовом метода this._funcWsSendBroadcast
	
	Также если isDebug == true, то подписчики события 'debug' объекта класса TeleportServer
	получат информацю о типе события и имя объекта его возбудившего,
	а также признак входит ли это событие в список разрешенных.
	
*/
TeleportServer.prototype._funcEmitterInit = function() {
	Object.keys(this._optionObjects).forEach(function(objectName) {
		var object = this._optionObjects[objectName].object;
		var events = this._optionObjects[objectName].events;

		if (events && object.emit) {
			object.__vanillaEmit__ = object.emit;

			object.emit = function() {
				var event = arguments[0];
				var args = Array.prototype.slice.call(arguments, 1, arguments.length);

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

				object.__vanillaEmit__.apply(object, arguments);
			}.bind(this);
		}
	}.bind(this));
};


//end emitter

//message hadlers
/**
	Приватный метод, который будет выздан анонимной функцией создоваемой методом this._funcWsOnMessageCreate,
	который в свою очередь вызывается когда ws server создает с пиром новое соединение.
	
	этот метод будет вызванн если в объекте message есть поле command.
	
	В этой функции из объекта message извлекается информации о message.objectName к которому происходит обращение,
	message.command (методе объекта), и аргументах передаваемых в метод - message.args.
	
	Если объект зарегистрирован в options.objects.someObjectName, и метод зарегистророванн в options.objects.someObjectName.methods
	то соответствующий метод, соответствующего объекта будет вызван c message.args (если есть), и созданным методом
	this.commandCallbackCreate каллбеком, который через замыкание будет иметь доступ к ws (соединению с пиром), и принятому запросу (message).
	и собственно этот анонимный каллбек и вернет результат работы метода клиенту, вызвав метод this._funcWsSend.
	
	Если объект или метод объекта не зарегистрированны, то клиенту будет возвращена ошибка, причем вернуться она калбек функции которая
	этот незарегистрированный метод вызвала на стороне клиента. Возвращается также вызовом метода this._funcWsSend

	message = {
		type: 'command',
		objectName: 'someObjectName',
		command: 'someMethodName',
		requestId: 0,
		args: someArgs
	}

 */
TeleportServer.prototype._funcCommandHandler = function(ws, message) {
	if (!this._optionObjects[message.objectName] || !this._optionObjects[message.objectName].methods || (this._optionObjects[message.objectName].methods.indexOf(message.command) == -1)) {
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

		this.emit('warn', errorInfo);
	} else {
		var callback = commandCallbackCreate(message).bind(this);

		var args = _.map(message.args, function(arg) {
			return arg
		}); //{0: 'foo', 1: 'bar'} => ['foo', 'bar']
		args.push(callback);

		var object = this._optionObjects[message.objectName].object;
		object[message.command].apply(object, args);
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
	Приватный метод, который будет выздан анонимной функцией создоваемой методом this._funcWsOnMessageCreate,
	который в свою очередь вызывается когда ws server создает с пиром новое соединение.
	
	этот метод будет вызванн если в объекте message есть поле internalCommand 
	Если тип internalCommand зарегестрированн, то команда будет выполненна
	и результат вернуться клиенту функцией this._funcWsSend
	Если тип команды не зарегистророван то будет клиенту будет возвращена ошибка.
		
	если internalCommand == "getObjects", то клиенту будут возвращены свойства серверных объектов.
	если internalCommand == "objectСreationСompleted", то это означает, что клиент успешно 
	инициализировал на своей строне все прокси объекты и их метода, TeleportServer выбросит событые "newClientConnected"

	message = {
		type: 'internalCommand',
		internalCommand: 'getObjects'
	}

*/
TeleportServer.prototype._funcInternalCommandHandler = function(ws, message) {
	if (message.internalCommand == "getObjects") {

		var resultObjects = {};
		for (var objectName in this._optionObjects) {
			resultObjects[objectName] = {
				methods: this._optionObjects[objectName].methods,
				events: this._optionObjects[objectName].events
			}
		}

		var result = {
			type: "internalCallback",
			internalCommand: message.internalCommand,
			error: null,
			result: resultObjects
		};

		this._funcWsSend(ws, result);

		if (this._optionIsDebug) this.emit('debug', {
			desc: 'TeleportServer: Подключившийся клиент запросил свойства серверных объектов',
			result: result
		});
	} else if (message.internalCommand == "objectСreationСompleted") {
		this.emit('newClientConnected');
		if (this._optionIsDebug) this.emit('debug', {
			desc: 'TeleportServer: Соединение с новым клентом успешно установленно, все серверные объекты на клиенте инициализированны.\nВыброшенно событие \'newClientConnected\''
		});
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

		this.emit('warn', errorInfo);
	}
};

//end message handlers

//wss
/**
	Этот метод инициализирует web socket Server.
	1. создает объект WebSocketServer, передав ему прянятый в options.port.
	2. подписывает обработчик новых соединение клиентов с сервером, на событие 'connection',
		когда новое соединение будет созданно, на события message этого соединения,
		будет закреплен хендлер созданный функцией _funcWsOnMessageCreate, нужно это 
		для того, чтобы сохранить ссылку на объект (через замыкание, для создаваемой анонимной функции) 
		соединения с этим клиентом, потому что в моем коде web socket соединение - 
		уникально идентифицирует связь одного клиента с сервером
	3. поодсываюсь на события готовности 'listening' и ошибки 'error'.

	Важно заметить, что если выброшенно событие `error` сервером, значит он совсем сломался,
	а без него существование TeleportServer бессмысленно, поэтому свою работу this прекращает.
	вызовом метода `this.destroy()`

*/
TeleportServer.prototype._funcWsServerInit = function() {
	this._valueWsServer = new WebSocketServer({
		port: this._optionWsServerPort
	});

	this._valueWsServer.on('error', function(error) {
		this.emit("error", {
			desc: "TeleportServer: Web Socket сервер выбросил ошибку.",
			error: error
		});

		this.destroy('error');
	}.bind(this));

	this._valueWsServer.on('connection', function(ws) {
		ws.on('message', this._funcWsOnMessageCreate(ws).bind(this));
		ws.on('error', function(err) {
			if (this._optionIsDebug) this.emit('debug', {
				desc: "TeleportServer: Произошла ошибка соединения с пиром",
				error: err
			});
		}.bind(this));
	}.bind(this));

	this._valueWsServer.on('listening', function() {
		var info = {
			desc: "TeleportServer: Ws Server - запущен",
			port: this._optionWsServerPort
		};

		this.emit('info', info);
		this.emit('ready');
	}.bind(this));
};

/**
	Метод для рассылки сообщения всем клиентам, принимает message произвольного формата.
	
*/
TeleportServer.prototype._funcWsSendBroadcast = function(message) {
	this._valueWsServer.clients.forEach(function(ws) {
		this._funcWsSend(ws, message);
	}.bind(this))
};

/**
	Метод для отпраки сообщения конкретному клиенту, 
	принимает первым аргументом ссылку на объект сессии с клиентом, 
	вторым произвольный message.

	Проверка на `readyState`введена всвязи с добавлением метода destroy
	так как когда сервер закрыватся, все соединения с пирами разрываются 
	(можно не разрывать если вызывать метод this._valueWsServer._serverClose())
	и вполне вероятная ситуация, в силу асинхронной природы js,
	в которой метод некоторого серверного возвращает данные через калбек,
	когда соединение уже разорванно.

	Так же стоит отметить, что ws сам при выполнении метода send проверяет readyState,
	но в случае если он отличен от OPEN возвращает слишком не информативную ошибку.

*/
TeleportServer.prototype._funcWsSend = function(ws, message) {
	if (ws.readyState == ws.OPEN) { //["CONNECTING", "OPEN", "CLOSING", "CLOSED"]
		ws.send(
			JSON.stringify(message),
			wsSendedCreate(message).bind(this));
	} else {
		var string = JSON.stringify(message);
		if (string.length > 400) string = string.substring(0, 400);
		else string = message;

		this.emit("warn", {
			desc: "TeleportServer: Сообщение приру отправлено не будет, так как соединение с ним закрылось",
			toSend: string
		});
	}

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

/**
	Метод который будет вызван при создании нового подключения клиентом, 
	анонимная функция им возвращенная будет подписанна на события 'message',
	этого соединения, ссылка на само соединение будет доступна создоваемой функции 
	через замыкание.

	Анонимная функция принимает сообщение от клиента, которое обязательно должно содержать
	поле type, на основе которого оно будет переданно соответствующим хендлерам

	message = {
		type: 'internalCommand',
		...
	}
	
*/
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

			this.emit('warn', errorInfo);
		}
	};
};

//end wss