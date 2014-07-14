var patternMatching = require('pattern-matching');
var Peer = require('./Peer');
var events = require('events');


module.exports = TeleportServer;

//TeleportServer.prototype = new events.EventEmitter();

function TeleportServer() {};


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
	if (!this._funcInternalCheckTimestampPattern(ws, message)) return;

	var peerId = this._valueWsPeers.length;

	var peer = new Peer(ws, message.args.timestamp, peerId, this._optionsClientLatency)
		.on('timeout', function(peerId) {
			this.emit('debug', {
				desc: "Клиент отключился и слишком долго не переподключался, все данные подготовленные к отправке для него - очищенны.",
				peerId: peerId,
				timeoutDelay: this._optionsClientLatency
			});

			this.emit('clientReconnectionTimeout', peerId);

			var peer = this._valueWsPeers[peerId];

			if (peer) {
				peer
					.removeAllListeners()
					.destroy();
			}

			//признак того, что клиента здесь больше нет :)
			//нужен для того чтобы отбить корректной ошибкой его запоздалую попытку переподключиться
			this._valueWsPeers[peerId] = false;
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
		desc: 'TeleportServer: Отправил клиенту peerId.',
		peerId: peerId
	});
};

TeleportServer.prototype._funcInternalHandlerSetPeerId = function(ws, message) {
	if (!this._funcInternalCheckPeerIdPattern(ws, message)) return;
	if (!this._funcInternalCheckTimestampPattern(ws, message)) return;

	var peerId = message.args.peerId;
	var timestamp = message.args.timestamp;

	var peer = this._valueWsPeers[peerId];
	if (peer === false) {
		var errorInfo = {
			desc: "TeleportServer: Истекло время ожидания вашего переподключения.",
			type: "timeout",
			peerId: peerId,
			peerTimestamp: timestamp
		};

		this.emit('warn', errorInfo);
		return this._funcWsSend(ws, createResultMessage(message, errorInfo));
	} else if (!peer) {
		var errorInfo = {
			desc: "TeleportServer: Клиента с таким peerId никогда не существовало.",
			type: "notfound",
			peerId: peerId,
			peerTimestamp: timestamp
		};

		this.emit('warn', errorInfo);
		return this._funcWsSend(ws, createResultMessage(message, errorInfo));
	} else if (peer.socket.connected) {
		var errorInfo = {
			desc: "TeleportServer: Клиент с таким peerId еще не отключился.",
			type: 'notDisconnected',
			peerId: peerId,
			peerTimestamp: timestamp
		};

		this.emit('warn', errorInfo);
		return this._funcWsSend(ws, createResultMessage(message, errorInfo));
	} else if (peer.timestamp != timestamp) {
		var errorInfo = {
			desc: "TeleportServer: Клиент с таким peerId имел другой timestamp",
			peerId: peerId,
			peerTimestamp: timestamp
		};

		this.emit('warn', errorInfo);
		return this._funcWsSend(ws, createResultMessage(message, errorInfo));
	} else {
		this._valueWsPeers[peerId].replaceSocket(ws);

		this.emit('debug', {
			desc: "TeleportServer: Принял от клиента ранее выданный ему peerId, " +
				"этот пир получит все имеющиеся для него калбеки неготовые на момент разрыва соединения.",
			peerId: peerId,
			peerTimestamp: timestamp
		});
		return this._funcWsSend(ws, createResultMessage(message));
	}
};

TeleportServer.prototype._funcInternalHandlerGetObjects = function(ws, message) {
	if (!this._funcInternalCheckPeerIdPattern(ws, message)) return;
	if (!this._funcInternalCheckPeerIdExist(ws, message)) return;

	var peerId = message.args.peerId;

	var resultObjects = {};
	for (var objectName in this._optionObjects) {
		resultObjects[objectName] = {
			methods: this._optionObjects[objectName].methods,
			events: this._optionObjects[objectName].events
		}
	}

	var result = createResultMessage(message, null, resultObjects);
	this._funcWsSend(ws, result);

	this.emit('debug', {
		desc: 'TeleportServer: Подключившийся клиент запросил свойства серверных объектов',
		result: result
	});
};

TeleportServer.prototype._funcInternalHandlerConnectionCompleted = function(ws, message) {
	if (!this._funcInternalCheckPeerIdPattern(ws, message)) return;
	if (!this._funcInternalCheckPeerIdExist(ws, message)) return;


	var peerId = message.args.peerId;
	if (this._valueWsPeers[peerId].isConnectionСompleted) {
		var errorInfo = {
			desc: "TeleportServer: this peerId already connected",
			message: message
		};

		this.emit('warn', errorInfo);
		return this._funcWsSend(ws, createResultMessage(message, errorInfo));
	} else {
		this._valueWsPeers[peerId].isConnectionСompleted = true;
	}

	this.emit('clientConnected', peerId);
	this.emit('debug', {
		desc: 'TeleportServer: Соединение с новым клентом успешно установленно, ' +
			'все серверные объекты на клиенте инициализированны. Выброшенно событие \'clientConnected\''
	});
};

TeleportServer.prototype._funcInternalHandlerReconnectinCompleted = function(ws, message) {
	if (!this._funcInternalCheckPeerIdPattern(ws, message)) return;
	if (!this._funcInternalCheckPeerIdExist(ws, message)) return;

	var peerId = message.args.peerId;
	if (this._valueWsPeers[peerId].isReconnectionCompleted) {
		var errorInfo = {
			desc: "TeleportServer: this peerId already reconnected",
			message: message
		};

		this.emit('warn', errorInfo);
		return this._funcWsSend(ws, createResultMessage(message, errorInfo));
	} else {
		this._valueWsPeers[peerId].isReconnectionCompleted = true;
	}

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
		internalRequestId: message.internalRequestId,
		error: error,
		result: result,
	};
};

TeleportServer.prototype._funcInternalCheckPeerIdPattern = function(ws, message) {
	if (!patternMatching(message, {
		args: {
			peerId: 'integer'
		}
	})) {
		var errorInfo = {
			desc: 'TeleportServer: incorrect peerId.',
			message: message
		}

		this.emit('warn', errorInfo);
		this._funcWsSend(ws, createResultMessage(message, errorInfo));

		return false;
	} else {
		return true;
	}
};

TeleportServer.prototype._funcInternalCheckPeerIdExist = function(ws, message) {
	var peerId = message.args.peerId;
	if (!this._valueWsPeers[peerId]) {
		var errorInfo = {
			desc: "TeleportServer: not found peer",
			message: message
		}

		this.emit('warn', errorInfo);
		this._funcWsSend(ws, createResultMessage(message, errorInfo));

		return false;
	} else {
		return true;
	}
};

TeleportServer.prototype._funcInternalCheckTimestampPattern = function(ws, message) {
	if (!patternMatching(message, {
		args: {
			timestamp: 'notEmptyString'
		}
	})) {
		var errorInfo = {
			desc: 'TeleportServer: incorrect timestamp.',
			message: message
		};

		this.emit('warn', errorInfo);
		this._funcWsSend(ws, createResultMessage(message, errorInfo));

		return false;
	} else {
		return true;
	}
};
