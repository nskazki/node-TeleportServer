"use strict"

//include microEvent
var MicroEvent = function() {};
MicroEvent.prototype = {
	on: function(event, fct) {
		this._events = this._events || {};
		this._events[event] = this._events[event] || [];
		this._events[event].push(fct);
	},
	removeListener: function(event, fct) {
		this._events = this._events || {};
		if (event in this._events === false) return;
		this._events[event].splice(this._events[event].indexOf(fct), 1);
	},
	emit: function(event /* , args... */ ) {
		this._events = this._events || {};
		if (event in this._events === false) return;
		for (var i = 0; i < this._events[event].length; i++) {
			this._events[event][i].apply(this, Array.prototype.slice.call(arguments, 1));
		}
	}
};

MicroEvent.mixin = function(destObject) {
	var props = ['on', 'unbind', 'emit'];
	for (var i = 0; i < props.length; i++) {
		if (typeof destObject === 'function') {
			destObject.prototype[props[i]] = MicroEvent.prototype[props[i]];
		} else {
			destObject[props[i]] = MicroEvent.prototype[props[i]];
		}
	}
}

//end include microEvent

//main code
function TeleportClient(options) {
	//options
	this._optionWsServerAddress = options.serverAddress;
	this._optionIsDebug = options.isDebug;

	//end options

	//values
	this._valueWsClient = null;
	this._valueRequests = [];
	this._valueObjects = null;

	this._valueIsInit = false;

	//end values
}

//public
TeleportClient.prototype.init = function() {
	if (!this._valueIsInit) {
		this._valueWsClient = new WebSocket(this._optionWsServerAddress);


		this._valueWsClient.onmessage = this._funcWsOnMessage.bind(this);
		this._valueWsClient.onopen = this._funcWsOnOpen.bind(this);
		this._valueWsClient.onclose = this._funcWsOnClosed.bind(this);
		this._valueWsClient.onerror = this._funcWsOnError.bind(this);

		this._valueIsInit = true;
	}

	return this;
};

//end public

//private
TeleportClient.prototype._funcWsSessionInit = function() {
	this._funcLogger({
		desc: "Info: отправил запрос на получение методов"
	})

	this._funcWsSendMessage({
		type: "internalCommand",
		internalCommand: "getObjects",
	});
};

this._funcInternalCallbackHandler = function(message) {
	if (message.internalCommand == "getObjects") {
		if (message.error) {
			var errorInfo = {
				desc: "Error: getObjects вернул ошибку: " + message.error,
				message: message
			};

			this._funcLogger(errorInfo);
			this.emit("error", errorInfo);
		} else {
			this._funcLogger({
				desc: "Info: объекты получены: " + message.result,
				message: message
			});

			this._valueObjects = message.result;

			for (var objectName in this._valueObjects) {
				this[objectName] = {};
				MicroEvent.mixin(this[objectName]);
				for (var methodIndex = 0; methodIndex < this._valueObjects[objectName].methods.length; methodIndex++) {
					var methodName = this._valueObjects[objectName].methods[methodIndex];
					this[objectName][methodName] = this._funcMethodCreate(objectName, methodName).bind(this);
				}
			}

			this.emit('ready');
		}
	} else {
		var errorInfo = {
			desc: "Error: пришел ответ на неожиданную команду: " + message.internalCommand,
			message: message
		};

		this._funcLogger(errorInfo);
		this.emit("error", errorInfo);
	}
};

TeleportClient.prototype._funcMethodCreate = function(objectName, methodName) {
	return function(options, callback) {
		if (!callback) {
			callback = options;
			options = null;
		}
		if (!callback) {
			callback = function() {};
		}

		var requestId = this._valueRequests.length;

		this._funcLogger({
			desc: "Info: вызвын метод серверного объекта: " + objectName + "." + methodName,
			args: options,
			requestId: requestId
		});

		this._valueRequests.push(callback);

		this._funcWsSendMessage({
			objectName: objectName,
			type: "command",
			command: methodName,
			requestId: requestId,
			args: options
		});
	};
};

TeleportClient.prototype._funcCallbackHandler = function(message) {
	this._funcLogger({
		desc: "Info: сервер вернул callback на: " + message.objectName + "." + message.command,
		message: message
	});

	this._valueRequests[message.requestId](message.error, message.result);
};

TeleportClient.prototype._funcEventHandler = function(message) {
	this._funcLogger({
		desc: "Info: сервер передал событие: " + message.objectName + "." + message.event,
		message: message
	});

	this[message.objectName].emit(message.event, message.args);
};

//end private

//server
TeleportClient.prototype._funcWsOnOpen = function() {
	this._funcLogger({
		desc: "Info: соединение с сервером установленно"
	});

	this._funcWsSessionInit();
}

TeleportClient.prototype._funcWsOnMessage = function(sourceMessage) {
	var message = JSON.parse(sourceMessage.data);

	if (message.type == "callback") {
		this._funcCallbackHandler(message);
	} else if (message.type == "internalCallback") {
		this._funcInternalCallbackHandler(message);
	} else if (message.type == "event") {
		this._funcEventHandler(message);
	} else {
		var errorInfo = {
			desc: "Error: для данного типа сообщений нет хэндлера: " + message.type,
			message: message
		};

		this._funcLogger(errorInfo);
		this.emit("error", errorInfo);
	}
};

TeleportClient.prototype._funcWsSendMessage = function(message) {
	try {
		var string = JSON.stringify(message);
		this._valueWsClient.send(string);
	} catch (error) {
		var errorInfo = {
			desc: "Error: ошибка отправки сообщения на сервер: " + error,
			message: message,
			error: error
		};

		this._funcLogger(errorInfo);
		this.emit("error", errorInfo);
	}
};

TeleportClient.prototype._funcWsOnClosed = function() {
	var errorInfo = {
		desc: "Error: соединение с сервером закрылось"
	};

	this._funcLogger(errorInfo);
	this.emit("error", errorInfo);
};

TeleportClient.prototype._funcWsOnError = function(error) {
	var errorInfo = {
		desc: "Error: WebSocket Client выбросил ошибку: " + error,
		error: error
	};

	this._funcLogger(errorInfo);
	this.emit("error", errorInfo);
};

//end server

//private
TeleportClient.prototype._funcLogger = function(log) {
	if (this._optionIsDebug) {
		console.log(log);
	}
}

//end private

MicroEvent.mixin(TeleportClient);

//end main code