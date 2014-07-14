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
		if (!peer) return logger.warn('peer, id %s - ~needPeerSend, peer not found, message: ', peerId, message);

		logger.debug('peer, id %s - ~needPeerSend, message: ', peerId, message);
		this.emit('needSocketSend', peer._socketId, message);
	}.bind(this));

	return this;
}

PeersController.prototype.down = function(socketsController) {
	socketsController.on('socketMessage', function(socketId, message) {
		if (!this._findPeer(socketId)) {
			logger.debug('socket, id: %s - #_peerAuth, message: ', socketId, message);

			this._peerAuth(socketId, message);
		} else {
			var peerId = this._findPeerId(socketId);
			logger.debug('peer, id: %s - !peerMessage: ', peerId, message);

			this.emit('peerMessage', peerId, message);
		}
	}.bind(this));

	socketsController.on('socketDisconnect', function(socketId) {
		if (this._findPeer(socketId)) {
			var peerId = this._findPeerId(socketId);

			delete this._socketToPeerMap[socketId];

			logger.debug('peer, id: %s - !peerDisconnect.', peerId);
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
		var peerId = this._lastPeerId++;
		var clientTimestamp = message.args.clientTimestamp;

		var peer = new Peer(socketId, peerId, clientTimestamp, this._peerDisconnectedTimeout)
			.on('timeout', function() {
				delete this._peerList[peerId];
				peer.destroy().removeAllListeners();

				logger.warn('peer, id %s - !peerDisconnectedTimeout.', peerId);
				this.emit('peerDisconnectedTimeout', peerId);
			}.bind(this));

		this._socketToPeerMap[socketId] = peerId;
		this._peerList[peerId] = peer;

		logger.debug('peer, id: %s - !peerConnection.', peerId);
		this.emit('peerConnection', peerId);
	} else if (jjv.test('reconnect', message)) {
		var peerId = message.args.peerId;

	}
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
	this._socketId = null;

	this._timeoutId = setTimeout(function() {
		logger.warn('peer, id %s - !timeout, peerDisconnectedTimeout: %d.',
			this._peerId, this._peerDisconnectedTimeout);

		this.emit('timeout', this._peerId);
	}.bind(this), this._peerDisconnectedTimeout);

	return this;
}

Peer.prototype.reconnect = function(socketId) {
	if (this._timeoutId) {
		clearTimeout(this._timeoutId);
		this._timeoutId = null;
	}

	this._socketId = socketId;

	return this;
}

Peer.prototype.destroy = function() {
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