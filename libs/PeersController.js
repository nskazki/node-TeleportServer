'use stricts';

/*
	Events:
	
		peerReconnect
		peerConnection
		peerDisconnect
		peerMessage
		peerDisconnectedTimeout

		needSocketSend

	Listenings:
	
		up:
			needPeerSend
			needPeersBroadcastSend
	
		down:

			socketMessage
			socketDisconnect
*/

var util = require('util');
var events = require('events');
var jjv = require('jjv')();
var debug = require('debug')('TeleportServer:PeersController');

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

module.exports = PeersController;

util.inherits(PeersController, events.EventEmitter);

function PeersController(peerDisconnectedTimeout) {
	this._socketToPeerMap = {};
	this._peerList = {};
	this._peerDisconnectedTimeout = peerDisconnectedTimeout || 500;

	this._lastPeerId = 0;

	this._selfBind();
	this._initAsyncEmit();
}

PeersController.prototype._initAsyncEmit = function() {
	var vanullaEmit = this.emit;
	this.emit = function() {
		var asyncArguments = arguments;

		process.nextTick(function() {
			vanullaEmit.apply(this, asyncArguments);
		}.bind(this));
	}.bind(this);
}

PeersController.prototype._selfBind = function() {
	this.on('peerDisconnect', function(peerId) {
		var peer = this._peerList[peerId];
		peer.disconnect();
	}.bind(this));
};

PeersController.prototype.up = function(objectsController) {
	objectsController.on('needPeerSend', function(peerId, message) {
		var peer = this._peerList[peerId];
		if (!peer) return logger.warn('peers, id: %s - ~needPeerSend, peer not found, message: ', peerId, message);

		logger.debug('peers, id: %s - ~needPeerSend, message: ', peerId, message);
		this.emit('needSocketSend', peer._socketId, message);
	}.bind(this));

	objectsController.on('needPeersBroadcastSend', function(message) {
		logger.debug('peers, id: all - ~needPeersBroadcastSend, message: ', message);

		for (var peerId in this._peerList) {
			if (this._peerList.hasOwnProperty(peerId)) {
				var peer = this._peerList[peerId];

				this.emit('needSocketSend', peer._socketId, message);
			}
		}
	}.bind(this));

	return this;
}

PeersController.prototype.down = function(socketsController) {
	socketsController.on('socketMessage', function(socketId, message) {
		if (!this._findPeer(socketId)) {
			logger.debug('peers, withoutId - #_peerAuth, socketId: %s, messager: ', socketId, message);

			this._peerAuth(socketId, message);
		} else {
			var peerId = this._findPeerId(socketId);
			logger.debug('peers, id: %s - !peerMessage: ', peerId, message);

			this.emit('peerMessage', peerId, message);
		}
	}.bind(this));

	socketsController.on('socketDisconnect', function(socketId) {
		if (this._findPeer(socketId)) {
			var peerId = this._findPeerId(socketId);

			delete this._socketToPeerMap[socketId];

			logger.debug('peers, id: %s - !peerDisconnect.', peerId);
			this.emit('peerDisconnect', peerId);
		}
	}.bind(this));

	return this;
}

PeersController.prototype._findPeer = function(socketId) {
	var peerId = this._findPeerId(socketId);
	var peer = this._peerList[peerId];

	return peer;
}

PeersController.prototype._findPeerId = function(socketId) {
	return this._socketToPeerMap[socketId];
}

PeersController.prototype._peerAuth = function(socketId, message) {
	if (jjv.test('connect', message)) {
		this._peerConnect(socketId, message);
	} else if (jjv.test('reconnect', message)) {
		this._peerReconnect(socketId, message);
	}
}

PeersController.prototype._peerConnect = function(socketId, message) {
	var peerId = this._lastPeerId++;
	var clientTimestamp = message.args.clientTimestamp;

	var peer = new Peer(socketId, peerId, clientTimestamp, this._peerDisconnectedTimeout)
		.on('timeout', function() {
			delete this._peerList[peerId];
			peer.destroy().removeAllListeners();

			logger.warn('peers, id: %s - !peerDisconnectedTimeout.', peerId);
			this.emit('peerDisconnectedTimeout', peerId);
		}.bind(this));

	this._socketToPeerMap[socketId] = peerId;
	this._peerList[peerId] = peer;

	logger.debug('peers, id: %s - !peerConnection.', peerId);

	// one message in - one message out
	// objectsController listenings ~peerConnection and emitted
	// !needPeerSend with objects props

	this.emit('peerConnection', peerId);
}

PeersController.prototype._peerReconnect = function(socketId, message) {
	var peerId = message.args.peerId;
	var clientTimestamp = message.args.clientTimestamp;

	logger.debug('peers, id: %s - #_peerReconnect.', peerId);

	var peer = this._peerList[peerId];
	if (peer && (peer._clientTimestamp == clientTimestamp)) {
		peer.reconnect(socketId);

		this.emit('needSocketSend', socketId, {
			type: 'internalCallback',
			internalCommand: message.internalCommand,
			error: null,
			result: 'reconnected!'
		});

		logger.debug('peers, id: %s - !peerReconnect.', peerId);

		return this.emit('peerReconnect', peerId);
	}

	logger.warn('peers, id: %s - reconnect error, socketId: %s, message: ', peerId, socketId, message);
	this.emit('needSocketSend', socketId, {
		type: 'internalCallback',
		internalCommand: message.internalCommand,
		error: 'reconnect error, maybe you timeout disconnected',
	});
}

//Peer

util.inherits(Peer, events.EventEmitter);

function Peer(socketId, peerId, clientTimestamp, peerDisconnectedTimeout) {
	this._peerId = peerId;
	this._socketId = socketId;
	this._clientTimestamp = clientTimestamp;
	this._peerDisconnectedTimeout = peerDisconnectedTimeout;
	this._timeoutId = null;
}

Peer.prototype.disconnect = function() {
	logger.debug('peer, id: %s - #disconnect.', this._peerId);

	this._socketId = null;

	this._timeoutId = setTimeout(function() {
		logger.warn('peer, id: %s - !timeout, peerDisconnectedTimeout: %d.',
			this._peerId, this._peerDisconnectedTimeout);

		this.emit('timeout', this._peerId);
	}.bind(this), this._peerDisconnectedTimeout);

	return this;
}

Peer.prototype.reconnect = function(socketId) {
	logger.debug('peer, id: %s - #reconnect, socketId: %s.', this._peerId, socketId);

	if (this._timeoutId) {
		clearTimeout(this._timeoutId);
		this._timeoutId = null;
	}

	this._socketId = socketId;

	return this;
}

Peer.prototype.destroy = function() {
	logger.debug('peer, id: %s - #destroy.', this._peerId);

	if (this._timeoutId) {
		clearTimeout(this._timeoutId);
		this._timeoutId = null;
	}

	this._peerId = null;
	this._socketId = null;
	this._clientTimestamp = null;
	this._peerDisconnectedTimeout = null;
	this._timeoutId = null;

	return this;
}

//jjv

jjv.addSchema('connect', {
	type: 'object',
	properties: {
		args: {
			type: 'object',
			properties: {
				clientTimestamp: {
					type: 'number'
				}
			},
			required: ['clientTimestamp']
		},
		type: {
			type: 'string',
			'enum': ['internalCommand']
		},
		internalCommand: {
			type: 'string',
			'enum': ['connect']
		}
	},
	required: ['args', 'type', 'internalCommand']
});

jjv.addSchema('reconnect', {
	type: 'object',
	properties: {
		args: {
			type: 'object',
			properties: {
				clientTimestamp: {
					type: 'number'
				},
				peerId: {
					type: 'number'
				}
			},
			required: ['clientTimestamp', 'peerId']
		},
		type: {
			type: 'string',
			'enum': ['internalCommand']
		},
		internalCommand: {
			type: 'string',
			'enum': ['reconnect']
		},
		required: ['args', 'internalCommand', 'type']
	}
});

jjv.test = function(schema, object) {
	var error = jjv.validate(schema, object);
	if (error) logger.warn('schema %s, error: ', schema, error);

	return !!!error;

	//by default #validate returned error or null
	//i'm returned true - if all ok, or false - if error
}