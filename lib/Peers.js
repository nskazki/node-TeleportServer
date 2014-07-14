var util = require('util');
var events = require('events');

module.exports = Peer;

util.inherits(Peer, events.EventEmitter);

function Peer(ws, timestamp, peerId, timeoutDelay) {
	this.socket = ws;
	this.timestamp = timestamp;
	this.peerId = peerId;
	this.timeoutDelay = timeoutDelay;
	this.timeoutId = null;
	this.isConnectionСompleted = false;
	this.isReconnectionCompleted = false;
};

Peer.prototype.init = function() {
	this._funcSocketSetOnCloseListeners();

	return this;
};

Peer.prototype.destroy = function() {
	this.socket.removeAllListeners();
	this.socket = null;

	this.timestamp = null;
	this.peerId = null;

	this.isConnectionСompleted = false;
	this.isReconnectionCompleted = false;

	if (this.timeoutId) {
		clearTimeout(this.timeoutId);
		this.timeoutId = null;
	}

	return this;
};

Peer.prototype.replaceSocket = function(ws) {
	this.socket.removeAllListeners();

	if (this.timeoutId) {
		clearTimeout(this.timeoutId);
		this.timeoutId = null;
	}

	this.socket = ws;
	this._funcSocketSetOnCloseListeners();

	return this;
};

Peer.prototype._funcSocketSetOnCloseListeners = function() {
	this.socket.on('disconnect', function() {
		this.isReconnectionCompleted = false;
		this.emit('clientDisconnected', this.peerId);

		if (this.timeoutDelay !== false) {
			this.timeoutId = setTimeout(this._funcSocketStateCheker.bind(this), this.timeoutDelay);
		}
	}.bind(this));
}

Peer.prototype._funcSocketStateCheker = function() {
	if (!this.socket.connected) this.emit('timeout', this.peerId);
};

TeleportServer.prototype._funcPeerSend = function(peerId, message) {
	var peer = this._valueWsPeers[peerId];

	if (!peer) {
		var string = (JSON.stringify(message).length > 400) ? (JSON.stringify(message).substring(0, 400) + "...") : message;

		this.emit('warn', {
			desc: "TeleportServer: Сообщение пиру отправлено не будет, потому что пира с таким peerId не существует, " +
				"или истекло время ожидания его переподключения.",
			peerId: peerId,
			message: string
		});
	} else if (peer.socket.readyState == peer.socket.OPEN) {
		this._funcWsSend(peer.socket, message);
	} else {
		var string = (JSON.stringify(message).length > 400) ? (JSON.stringify(message).substring(0, 400) + "...") : message;

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

TeleportServer.prototype._funcPeerSend = function(peerId, message) {
	var peer = this._valueWsPeers[peerId];

	if (!peer) {
		var string = (JSON.stringify(message).length > 400) ? (JSON.stringify(message).substring(0, 400) + "...") : message;

		this.emit('warn', {
			desc: "TeleportServer: Сообщение пиру отправлено не будет, потому что пира с таким peerId не существует, " +
				"или истекло время ожидания его переподключения.",
			peerId: peerId,
			message: string
		});
	} else if (peer.socket.readyState == peer.socket.OPEN) {
		this._funcWsSend(peer.socket, message);
	} else {
		var string = (JSON.stringify(message).length > 400) ? (JSON.stringify(message).substring(0, 400) + "...") : message;

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

TeleportServer.prototype._funcPeerSendBroadcast = function(message) {
	this._valueWsPeers.forEach(function(peer) {
		if (peer) this._funcPeerSend(peer.peerId, message);
	}.bind(this))
};