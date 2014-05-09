"use strict"

function TeleportClient(options) {
	//global
	var myGlobal = this;

	//end global

	//options
	myGlobal._optionWsServerAddress = options.serverAddress;
	myGlobal._optionIsDebug = options.isDebug;

	//end options

	//values
	myGlobal._valueWsClient = null;
	myGlobal._valueRequests = [];
	myGlobal._valueObjects = null;

	myGlobal._valueIsInit = false;

	//end values

	//public
	myGlobal.init = function() {
		if (!myGlobal._valueIsInit) {
			myGlobal._valueWsClient = new WebSocket(myGlobal._optionWsServerAddress);


			myGlobal._valueWsClient.onmessage = myGlobal._funcWsOnMessage;
			myGlobal._valueWsClient.onopen = myGlobal._funcWsOnOpen;
			myGlobal._valueWsClient.onclose = myGlobal._funcWsOnClosed;
			myGlobal._valueWsClient.onerror = myGlobal._funcWsOnError;

			myGlobal._valueIsInit = true;
		}

		return myGlobal;
	};

	//end public

	//private
	myGlobal._funcWsSessionInit = function() {
		myGlobal._funcLogger({
			desc: "Info: отправил запрос на получение методов"
		})

		myGlobal._funcWsSendMessage({
			type: "internalCommand",
			internalCommand: "getObjects",
		});
	};

	myGlobal._funcInternalCallbackHandler = function(message) {
		if (message.internalCommand == "getObjects") {
			if (message.error) {
				var errorInfo = {
					desc: "Error: getObjects вернул ошибку: " + message.error,
					message: message
				};

				myGlobal._funcLogger(errorInfo);
				myGlobal.emit("error", errorInfo);
			} else {
				myGlobal._funcLogger({
					desc: "Info: объекты получены: " + message.result,
					message: message
				});

				myGlobal._valueObjects = message.result;

				for (var objectName in myGlobal._valueObjects) {
					myGlobal[objectName] = {};
					MicroEvent.mixin(myGlobal[objectName]);
					for (var methodIndex = 0; methodIndex < myGlobal._valueObjects[objectName].methods.length; methodIndex++) {
						var methodName = myGlobal._valueObjects[objectName].methods[methodIndex];
						myGlobal[objectName][methodName] = myGlobal._funcMethodCreate(objectName, methodName);
					}
				}

				myGlobal.emit('ready');
			}
		} else {
			var errorInfo = {
				desc: "Error: пришел ответ на неожиданную команду: " + message.internalCommand,
				message: message
			};

			myGlobal._funcLogger(errorInfo);
			myGlobal.emit("error", errorInfo);
		}
	};

	myGlobal._funcMethodCreate = function(objectName, methodName) {
		return function(options, callback) {
			if (!callback) {
				callback = options;
				options = null;
			}
			if (!callback) {
				callback = function() {};
			}

			var requestId = myGlobal._valueRequests.length;

			myGlobal._funcLogger({
				desc: "Info: вызвын метод серверного объекта: " + objectName + "." + methodName,
				args: options,
				requestId: requestId
			});

			myGlobal._valueRequests.push(callback);

			myGlobal._funcWsSendMessage({
				objectName: objectName,
				type: "command",
				command: methodName,
				requestId: requestId,
				args: options
			});
		};
	};

	myGlobal._funcCallbackHandler = function(message) {
		myGlobal._funcLogger({
			desc: "Info: сервер вернул callback на: " + message.objectName + "." + message.command,
			message: message
		});

		myGlobal._valueRequests[message.requestId](message.error, message.result);
	};

	myGlobal._funcEventHandler = function(message) {
		myGlobal._funcLogger({
			desc: "Info: сервер передал событие: " + message.objectName + "." + message.event,
			message: message
		});

		myGlobal[message.objectName].emit(message.event, message.args);
	};

	//end private

	//server
	myGlobal._funcWsOnOpen = function() {
		myGlobal._funcLogger({
			desc: "Info: соединение с сервером установленно"
		});

		myGlobal._funcWsSessionInit();
	}

	myGlobal._funcWsOnMessage = function(sourceMessage) {
		var message = JSON.parse(sourceMessage.data);

		if (message.type == "callback") {
			myGlobal._funcCallbackHandler(message);
		} else if (message.type == "internalCallback") {
			myGlobal._funcInternalCallbackHandler(message);
		} else if (message.type == "event") {
			myGlobal._funcEventHandler(message);
		} else {
			var errorInfo = {
				desc: "Error: для данного типа сообщений нет хэндлера: " + message.type,
				message: message
			};

			myGlobal._funcLogger(errorInfo);
			myGlobal.emit("error", errorInfo);
		}
	};

	myGlobal._funcWsSendMessage = function(message) {
		try {
			var string = JSON.stringify(message);
			myGlobal._valueWsClient.send(string);
		} catch (error) {
			var errorInfo = {
				desc: "Error: ошибка отправки сообщения на сервер: " + error,
				message: message,
				error: error
			};

			myGlobal._funcLogger(errorInfo);
			myGlobal.emit("error", errorInfo);
		}
	};

	myGlobal._funcWsOnClosed = function() {
		var errorInfo = {
			desc: "Error: соединение с сервером закрылось"
		};

		myGlobal._funcLogger(errorInfo);
		myGlobal.emit("error", errorInfo);
	};

	myGlobal._funcWsOnError = function(error) {
		var errorInfo = {
			desc: "Error: WebSocket Client выбросил ошибку: " + error,
			error: error
		};

		myGlobal._funcLogger(errorInfo);
		myGlobal.emit("error", errorInfo);
	};

	//end server

	//private
	myGlobal._funcLogger = function(log) {
		if (myGlobal._optionIsDebug) {
			console.log(log);
		}
	}

	//end private
}

MicroEvent.mixin(TeleportClient);