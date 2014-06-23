/**
	https://github.com/nskazki/node-TeleportServer
	MIT
	from russia with love, 2014
*/


/**

	Public:

		init
		destroy

	Events:

		debug 
		info 
		warn 
		error 

		ready 
		close 
		destroyed

		restarted
		restarting

		clientConnected
		clientReconnected
		clientReconnectionTimeout
		clientDisconnected
*/

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
	Это RPC сервер, умеет вызывать методы серверных объектов и сообщать подключенным клиентом 
	о выбрасываемых объектами событиях.

	Конструктор класса TeleportServer, принимает единственным параметром объект с опциями,
	возвращает новый неинециализированный объект класса TeleportServer

	------------------

	options = {
		port: 8000,
		clientLatency: 10000,
		autoRestart: 3000,
		objects: {
			'simpleObject': {
				object: simpleObject,
				methods: 'simpleAsyncFunc',
				events: 'myOptions'
			}
		}
	}

	port - порт для подключения TeleportClient
		default: 8000

	clientLatency - время в течение которого сервер ожидает переподключения клиента.
		если это время истекает, данные накопленные сгенерированные серверными объектами (результаты возвращенные
		вызванными клиентом методов и выброшенные серверными объектами события) после его отключения будут очищенны.
		если клиент успеет переподключится, то обозначенные данные он получит.
		если false, то сервер будет бесконечно ожидать переподключения клиента.
		default: 10000msec

	autoRestart - параметры автоматического перезапуска веб сокет сервера в случае возникновения внутри него ошибки.
		если false перезапус автоматически производится не будет
		если число, то время задержки перед перезапуском ws server
		default: false

	objects - ссылки на доступные для клиентов объкты, их разрешенные асинхронные методы 
		и разрешенные к передаче клиентам события

	------------------

	формат инициалируемых полей:
	
	this._valueWsServer - поле которое будет проиницилизированно методом _funcWsServerInit, 
	в него будет записанна ссылка на экземпляр web socket server.
	
	this._valueWsPeers - массив подключенных клиентов, где позиция в массиве соответствует peerId клиента
	нужен на случай разрыва клиентом подключения и последующего переподключения.
	хранит в себе сокет (объект хранящий соединение с клиентом) и timestamp инициализации клиента.

	this._valueTimestamp - отметка момента инициализации сервера.

	this._valueIsReadyEmited - флаг отображающий был ли сервер когда либо корректно запущенн 
	(было ли выброшенно событие `ready`).
	нужно для того чтобы запускатор сервера после его корректного старта выбрасывал событие `ready` - если это первый успешный запуск,
	или `restarted` - если это успешный перезапуск.

	------------------

	нужен все это вот зачем:
	
	сценарий 1:
		может упасть core ws server, но само node.js приложение и собственно объект этого сервера остаться в строю.
		в случае такого происшествия ws server будет перезапущенн, клиенты к нему переподключаться.
		
		переподключившийся клиент запросит timestamp, сверит с ранее полученным и увидит, что  он не изменился.
		значит рвалось только соединение, а ранее полученный peerId и калбеки на запрошенные им методы, его 
		ждут на сервере.

		после принятия этого решения, клиент отправляет ранее полученный peerId на сервер
		и продолжает ждать результотов не завершенных калбеков.
		
		сервер же в свою очередь получив от клиента ранее зарегистрированный peerId поместит соединение с ним (сокет)
		в соответствующий объект класса Peer массива _valueWsPeers и выбросит из этого объект событие reconnected

		подписчики на это событие генерируется функцией _funcPeerSend в случае если соединение с пиром
		которому нужно что-то отправить закрылось.  

		также самым сервером будет выброшенно событие `clientReconnected`

	сценарий 2:

		а может свалится node.js приложение все, тогда результатов клиентам не видать.
		
		и тогда переподключившийся клиент получает от сервера timestamp видит несовпадение, 
		понимает что перезапущенно все приложение целиком, перезапрашивает peerId,
		и закрывает все ожидающие на его стороне калбеки ошибкой, мол сервер ребутнулся.

		для сервера же это выглядит как свеже подключившийся клиент, который добросовестно передал свой 
		timestamp, получил peerId, но не запросив свойства сервеных объектов сразу рапортовал о готовности.
		после чего сервер выбросит `clientConnected`

		свойства серверных объектов не запрашиваются, потому что клиент их получал когда соединялся 
		с прошлым экземпляром сервера. и не парится, что они могли измениться, потому что изменения этих
		свойств влечет изменения кода на клиенте, для применения которых все равно нужно обновить страничку :)

	сценарий 3:
		
		клиент впервые подключается к серверу, получает таймштамп сервера, передает свой тайм штамп, 
		получает peerId, получает свойства серверных объектов, регистрирует их у себя и сообщает серверу
		о готовности, о чем сервер рабортует радостным `clientConnected`
	
*/
function TeleportServer(options) {
	//options
	this._optionWsServerPort = options.port || 8000;
	this._optionObjects = options.objects;

	this._optionsClientLatency = (options.clientLatency === undefined) ? 10000 : options.clientLatency;
	this._optionAutoRestart = (options.autoRestart === undefined) ? false : options.autoRestart;

	//end options

	//variables
	this._valueWsServer = null;
	this._valueWsPeers = [];

	this._valueTimestamp = new Date();

	this._valueIsInit = false;
	this._valueIsReadyEmited = false;

	//end variables
}

/**
	Инициализирующий метод, вызывающий приватный инициализирующие методы класса.
	А имеенно, 
		создает web socket сервер 
		выполняет monkey patching EventEmitter-a переданных в опциях объектов.
	
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
	Выбрасывает последние `info` and `close` и `destroyed`
	И в конце ставить флаг "не инициализирован" this._valueIsInit = false

*/
TeleportServer.prototype.destroy = function() {
	if (this._valueIsInit) {
		this.emit('info', {
			desc: 'TeleportServer: Работа сервера штатно прекращена, все соединения с пирами разорванны, ' +
				'подписчики на серверные события удаленны не будут, потому что трогать внешний код плохая идея.'
		});

		for (var objectName in this._optionObjects) {
			var object = this._optionObjects[objectName].object;

			if (object.emit && this._optionObjects[objectName].__vanillaEmit__) {
				object.emit = this._optionObjects[objectName].__vanillaEmit__;
				delete this._optionObjects[objectName].__vanillaEmit__;
			}
		}

		this._valueIsInit = false;

		if (this._valueWsServer) {
			this._funcWsServerClose();
			this.emit('close');
		}

		this.emit('destroyed');
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
	или options.objects.someObjectName.events === true, что означает, что разрешенны к передаче все события,
	то информация о имени объекта возбудившего событие (options.objects.someObjectName),
	тип и аргументы события передаются RPC клиенту, вызовом метода this._funcPeerSendBroadcast
	
	исходный метод emit храниться в this._optionObjects[objectName].__vanillaEmit__
	для того чтобы его можно было востановить серверный объект, когда будет вызван destroy 
	
*/
TeleportServer.prototype._funcEmitterInit = function() {
	Object.keys(this._optionObjects).forEach(function(objectName) {
		var object = this._optionObjects[objectName].object;
		var events = this._optionObjects[objectName].events;

		if (object && events && object.emit) {
			this._optionObjects[objectName].__vanillaEmit__ = object.emit;

			object.emit = function() {
				var event = arguments[0];
				var args = Array.prototype.slice.call(arguments, 1, arguments.length);

				var isEventTeleporting = (events === true) || (events.indexOf(event) != -1);

				this.emit("debug", {
					desc: "TeleportServer: зарегистрированный объект выбросил событие.",
					objectName: objectName,
					event: event,
					isEventTeleporting: isEventTeleporting,
					permitEvents: events
				});

				if (isEventTeleporting) {
					this._funcPeerSendBroadcast({
						objectName: objectName,
						type: "event",
						event: event,
						args: args
					});
				}

				this._optionObjects[objectName].__vanillaEmit__.apply(object, arguments);
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
	this.commandCallbackCreate каллбеком, который через замыкание будет иметь доступ к принятому запросу (message).
	и собственно этот анонимный каллбек и вернет результат работы метода клиенту, вызвав метод this._funcPeerSend.
	
	Если объект или метод объекта не зарегистрированны, то клиенту будет возвращена ошибка, причем вернуться она калбек функции которая
	этот незарегистрированный метод вызвала на стороне клиента. Возвращается также вызовом метода this._funcPeerSend

	message = {
		type: 'command',
		objectName: 'someObjectName',
		command: 'someMethodName',
		peerId: 0,
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

		this._funcPeerSend(message.peerId, {
			objectName: message.objectName,
			type: "callback",
			command: message.command,
			peerId: message.peerId,
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
	function commandCallbackCreate(message) {
		return function(error, result) {
			var resultToSend = {
				objectName: message.objectName,
				type: "callback",
				command: message.command,
				peerId: message.peerId,
				requestId: message.requestId,
				error: error,
				result: result,
			};

			this._funcPeerSend(message.peerId, resultToSend);
		};
	};

	//	end helpers
};

/**
	Приватный метод, который будет выздан анонимной функцией создоваемой методом this._funcWsOnMessageCreate,
	который в свою очередь вызывается когда ws server создает с пиром новое соединение.
	
	этот метод будет вызванн если в объекте message есть поле internalCommand 
	Если тип internalCommand зарегестрированн, то команда будет выполненна
	и результат вернуться клиенту функцией this._funcPeerSend
	Если тип команды не зарегистророван то будет клиенту будет возвращена ошибка.
		
	типы команд:

		getTimestamp - первая команда от клиента, timestamp нужен клиенту, чтобы после разрыву и востановлению
		соединения с сервером понять с тем же экземпляром сервера он соединлся или нет.

		getPeerId - команда от клиента который подключается к серверу впервые, или 
		у которого не совпал timestamp с прошлым.

		setPeerId - команда от клиента который увидел, что сервер не изменился, раз так он 
		сообщает ему свой прошлый peerId, чтобы получить недополученные результаты.
		кстати клиент тоже передает свой timestamp и если он несовпадет с хранящимся на сервере
		для этого peerId, то клиенту вернется ошибка.

		getObjects - команда от клиента подключившегося впервые. 
		сервер вернет свойства всех доступных серверных объектов.
	
		connectionСompleted - извещение от клиента о том, что он успещно подключился.

		reconnectionCompleted - извещение от клиента о том, что он успешно переподключился.

	message = {
		type: 'internalCommand',
		internalCommand: 'getObjects',
		args: {
			timestamp: new Date()
		}
	}

*/
TeleportServer.prototype._funcInternalCommandHandler = function(ws, message) {
	var funcName = this._constInternalCommandToFuncMap[message.internalCommand]

	if (funcName) {
		this[funcName].bind(this)(ws, message);
	} else {
		var errorInfo = ({
			desc: "TeleportServer: поступила неожиданная сервисная команда",
			message: message
		});

		var error = createResultMessage(message, errorInfo);
		this._funcWsSend(ws, error);

		this.emit('warn', errorInfo);
	}
};

TeleportServer.prototype._constInternalCommandToFuncMap = {
	'getTimestamp': '_funcInternalHandlerGetTimestamp',
	'getPeerId': '_funcInternalHandlerGetPeerId',
	'setPeerId': '_funcInternalHandlerSetPeerId',
	'getObjects': '_funcInternalHandlerGetObjects',
	'connectionСompleted': '_funcInternalHandlerConnectionCompleted',
	'reconnectionCompleted': '_funcInternalHandlerReconnectinCompleted'
};

TeleportServer.prototype._funcInternalHandlerGetTimestamp = function(ws, message) {
	var result = createResultMessage(message, null, this._valueTimestamp);
	this._funcWsSend(ws, result);

	this.emit('debug', {
		desc: "TeleportServer: клиент запросил timestamp",
		timestamp: this._valueTimestamp
	});
};

TeleportServer.prototype._funcInternalHandlerGetPeerId = function(ws, message) {
	var peerId = this._valueWsPeers.length || 0;


	var peer = new Peer(ws, message.args.timestamp, peerId, this._optionsClientLatency)
		.on('timeout', function(peerId) {
			this.emit('debug', {
				desc: "Клиент отключился и слишком долго не переподключался, все данные подготовленные к отправке для него - очищенны.",
				peerId: peerId,
				timeoutDelay: this._optionsClientLatency
			});

			this.emit('clientReconnectionTimeout', peerId);

			var peer = this._valueWsPeers[peerId];
			peer
				.removeAllListeners('timeout')
				.removeAllListeners('reconnected')
				.destroy();

			delete this._valueWsPeers[peerId];
		}.bind(this))
		.on('clientDisconnected', function(peerId) {
			this.emit('debug', {
				desc: "Клиент отключился, возможно он еще успеет переподключится.",
				peerId: peerId,
				timeoutDelay: this._optionsClientLatency
			});

			this.emit('clientDisconnected', peerId);
		}.bind(this))
		.init();

	this._valueWsPeers.push(peer);

	var result = createResultMessage(message, null, peerId);
	this._funcWsSend(ws, result);

	this.emit('debug', {
		desc: 'TeleportServer: Отправил клиенту peerId, отныне отвечать пиру буду через метод _funcPeerSend',
		peerId: peerId
	});
};

TeleportServer.prototype._funcInternalHandlerSetPeerId = function(ws, message) {
	var peerId = message.args.peerId;
	var timestamp = message.args.timestamp;

	var peer = this._valueWsPeers[peerId];
	if (!peer) {
		var errorInfo = {
			desc: "TeleportServer: Клиента с таким peerId никогда не существовало, или истекло время ожидания его переподключения.",
			peerId: peerId,
			peerTimestamp: timestamp
		};

		this._funcWsSend(ws, createResultMessage(message, errorInfo));
		this.emit('warn', errorInfo);
	} else if (peer.timestamp != timestamp) {
		var errorInfo = {
			desc: "TeleportServer: Клиент с таким peerId имел другой timestamp",
			peerId: peerId,
			peerTimestamp: timestamp
		};

		this._funcWsSend(ws, createResultMessage(message, errorInfo));
		this.emit('warn', errorInfo);
	} else {
		this._valueWsPeers[peerId].replaceSocket(ws);

		var result = createResultMessage(message);
		this._funcWsSend(ws, result);

		this.emit('debug', {
			desc: "TeleportServer: Принял от клиента ранее выданный ему peerId, отныне отвечать пиру " +
				"буду через метод _funcPeerSend, также этот пир получит все имеющиеся для него " +
				"калбеки неготовые на момент разрыва соединения.",
			peerId: peerId,
			peerTimestamp: timestamp
		});
	}
};

TeleportServer.prototype._funcInternalHandlerGetObjects = function(ws, message) {
	var peerId = message.args.peerId;

	var resultObjects = {};
	for (var objectName in this._optionObjects) {
		resultObjects[objectName] = {
			methods: this._optionObjects[objectName].methods,
			events: this._optionObjects[objectName].events
		}
	}

	var result = createResultMessage(message, null, resultObjects);
	this._funcPeerSend(peerId, result);

	this.emit('debug', {
		desc: 'TeleportServer: Подключившийся клиент запросил свойства серверных объектов',
		result: result
	});
};

TeleportServer.prototype._funcInternalHandlerConnectionCompleted = function(ws, message) {
	var peerId = message.args.peerId;

	this.emit('clientConnected', peerId);
	this.emit('debug', {
		desc: 'TeleportServer: Соединение с новым клентом успешно установленно, ' +
			'все серверные объекты на клиенте инициализированны. Выброшенно событие \'clientConnected\''
	});
};

TeleportServer.prototype._funcInternalHandlerReconnectinCompleted = function(ws, message) {
	var peerId = message.args.peerId;
	this._valueWsPeers[peerId].emit('reconnected');

	this.emit('clientReconnected', peerId);
	this.emit('debug', {
		desc: 'TeleportServer: Клиент завершил переподключение, ' +
			'и он готов принять накопленные для него события и выполненные результаты команд. Выброшенно событие \'clientReconnected\''
	});
};

function createResultMessage(message, error, result) {
	return {
		type: "internalCallback",
		internalCommand: message.internalCommand,
		error: error,
		result: result,
	};
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
		соединения с этим клиентом
	3. поодписываюсь на события `listening`, `error` и `close`

	Важно заметить, что если выброшенно событие `error` сервером, значит он совсем сломался.
	Также стоить заметить что ws server не выбрасывает события `close` при штатном или нештатном своем отключении.
	
	поэтому я отслеживаю `close` httpServera, котрый является core для ws server - следствие вызова _valueWsServer.close()
		без моего ведома
	и `error` самого ws servera, для отлова все возможных ошибок.

	а отслежию я их, для того чтобы перезапустить ws server или выбросить `close`, в
	зависимости от настройки restart.isUse
	
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

		if (this._optionAutoRestart !== false) {
			this._funcWsServerClose();
			this.emit('close');
		} else this._funcWsServerRestart();
	}.bind(this));

	this._valueWsServer._server.on('close', function() {
		if (!this._optionAutoRestart !== false) {
			this._funcWsServerClose();
			this.emit('close');
		} else this._funcWsServerRestart();
	}.bind(this));

	this._valueWsServer.on('connection', function(ws) {
		ws
			.on('message', this._funcWsOnMessageCreate(ws).bind(this))
			.on('error', function(err) {
				this.emit('debug', {
					desc: "TeleportServer: Произошла ошибка соединения с пиром",
					error: err
				});
			}.bind(this));
	}.bind(this));

	this._valueWsServer.on('listening', function() {
		this.emit('info', {
			desc: "TeleportServer: Ws Server - запущен",
			port: this._optionWsServerPort
		});

		if (!this._valueIsReadyEmited) {
			this.emit('ready');
			this._valueIsReadyEmited = true;
		} else {
			this.emit('restarted');
		}
	}.bind(this));
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

		this.emit('debug', {
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


/**
 	Метод перезапускающий ws server
 	уведомляет об этом всех желающих выбрасывая `restarting`

 	очищает и прибивает ws server.
 	и по таймауту запускает его инициализацию.

 */
TeleportServer.prototype._funcWsServerRestart = function() {
	this.emit('restarting');

	this.emit('warn', {
		desc: "Будет выполненн перезапуск сервера.",
		delay: this._optionAutoRestart,
	});

	this._funcWsServerClose();

	setTimeout(this._funcWsServerInit.bind(this), this._optionAutoRestart);
};

TeleportServer.prototype._funcWsServerClose = function() {
	this._valueWsServer
		.removeAllListeners('listening')
		.removeAllListeners('error')
		.removeAllListeners('connection');

	try {
		this._valueWsServer._server
			.removeAllListeners('close');

		this._valueWsServer.close();
	} catch (err) {}

	this._valueWsServer = null;
};

/**
	Метод для рассылки сообщения всем клиентам, принимает message произвольного формата.
	
*/
TeleportServer.prototype._funcPeerSendBroadcast = function(message) {
	this._valueWsPeers.forEach(function(peer) {
		if (peer) this._funcPeerSend(peer.peerId, message);
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
		var string = (JSON.stringify(message).length > 400) ? (string.substring(0, 400) + "...") : message;
		this.emit("debug", {
			desc: "TeleportServer: Сообщение приру отправлено не будет так как соединение с ним закрылось.",
			toSend: string
		});
	}

	function wsSendedCreate(toSend) {
		return function(error) {
			if (error) {
				this.emit('warn', {
					desc: "TeleportServer: Во время отправки сообщения пиру произошла ошибка.",
					error: error,
					toSend: toSend
				});
			} else {
				this.emit('debug', {
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
	Метод отпрвляющий сообщение не в конкретный объект соединения, а некоему с peerId.
	нужно на случай если клиент конкретное соединение будет разорванно, пока выполняется
	команда результат которой будет переданн этому методом.

*/
TeleportServer.prototype._funcPeerSend = function(peerId, message) {
	var peer = this._valueWsPeers[peerId];

	if (!peer) {
		var string = (JSON.stringify(message).length > 400) ? (string.substring(0, 400) + "...") : message;

		this.emit('warn', {
			desc: "TeleportServer: Сообщение пиру отправлено не будет, потому что пира с таким peerId не существует, " +
				"или истекло время ожидания его переподключения.",
			peerId: peerId,
			message: string
		});
	} else if (peer.socket.readyState == peer.socket.OPEN) {
		this._funcWsSend(peer.socket, message);
	} else {
		var string = (JSON.stringify(message).length > 400) ? (string.substring(0, 400) + "...") : message;

		this.emit('debug', {
			desc: "TeleportServer: Пир отключился, сообщение будет отправленно, когда он сново подключится.",
			peerId: peerId,
			message: string
		});

		peer.once('reconnected', function() {
			this._funcWsSend(peer.socket, message);

			this.emit('debug', {
				desc: "TeleportServer: Сообщение отправленно переподклювшемуся пиру.",
				peerId: peerId,
				message: string
			});
		}.bind(this));
	}
}

//end wss



/**
	Public:

		init
		destroy
		replaceSocket

	Events: 

		reconnected
		timeout
*/

/**
	Объкт содержащий соединение с текущим клиентом.
	Нужен на случай если:
		клиент запросит выполнение команды на сервере,
		разорвет соединение,
		команды выполнится,
		клиент снова подключится.
	
	Когда клиент перереподключится, из этого объекта будет выброшенно событие reconnected.
	и тогда подписчик отправить этому клиенту все накопленные результаты выполнений команд. 

*/

util.inherits(Peer, events.EventEmitter);

function Peer(ws, timestamp, peerId, timeoutDelay) {
	this.socket = ws;
	this.timestamp = timestamp;
	this.peerId = peerId;
	this.timeoutDelay = timeoutDelay;
};

Peer.prototype.init = function() {
	/*this.socket._myTime = new Date();

	console.log('init');
	console.log(this.socket._myTime);
*/
	this._funcSocketSetOnCloseListeners();

	return this;
};

Peer.prototype.destroy = function() {
	/*console.log('destroy');
	console.log(this.socket._myTime);
*/
	this.socket.removeAllListeners('close');
	this.socket = null;

	this.timestamp = null;
	this.peerId = null;
	this.timeoutDelay = null;

	return this;
};

Peer.prototype.replaceSocket = function(ws) {
	this.socket.removeAllListeners('close');

	this.socket = ws;
	this._funcSocketSetOnCloseListeners();

	return this;
};

Peer.prototype._funcSocketSetOnCloseListeners = function() {
	this.socket.on('close', function() {
		this.emit('clientDisconnected', this.peerId);

		if (this.timeoutDelay !== false) setTimeout(this._funcSocketStateCheker.bind(this), this.timeoutDelay);
	}.bind(this));
}

Peer.prototype._funcSocketStateCheker = function() {
	if (this.socket.readyState != this.socket.OPEN) this.emit('timeout', this.peerId);
};