'use stricts';

/*
	Events:
	
		peerReconnection
		peerConnection
		peerDisconnection
		peerMessage
		peerDisconnectedTimeout

		needSocketSend
		needSocketClose
		needObjectsSend

		peersControllerDestroyed
		peersControllerAlreadyDestroyed

	Listenings:
	
		up:
			needPeerSend
			needPeersBroadcastSend
	
		down:

			socketMessage
			socketDisconnection
*/

var util = require('util');
var events = require('events');
var jjv = require('jjv')();
var debug = require('debug')('TeleportServer:PeersController');

module.exports = PeersController;

util.inherits(PeersController, events.EventEmitter);

function PeersController(peerDisconnectedTimeout, authFunc) {
	this._initAsyncEmit();

	this._socketToPeerMap = {};
	this._peerList = {};
	this._peerDisconnectedTimeout = peerDisconnectedTimeout;

	this._lastPeerId = 0;
	this._authFunc = authFunc;

	this._selfBind();

	this._isInit = true;
}

PeersController.prototype.destroy = function() {
	if (this._isInit === true) {
		this._isInit = false;

		for (var peerId in this._peerList) {
			if (this._peerList.hasOwnProperty(peerId)) {
				var peer = this._peerList[peerId];
				peer.destroy().removeAllListeners();
			}
		}

		debug('#destroy -> !peersControllerDestroyed');
		this.emit('peersControllerDestroyed');
	} else {

		debug('#destroy -> !peersControllerAlreadyDestroyed');
		this.emit('peersControllerAlreadyDestroyed');
	}

	return this;
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
	this.on('peerDisconnection', function(peerId) {
		var peer = this._peerList[peerId];

		debug('peerId: %s, ~peerDisconnection -> delete socketId from socketToPeerMap && call peer#disconnect',
			peerId, peer._socketId)

		delete this._socketToPeerMap[peer._socketId];
		peer.disconnect();
	}.bind(this));

	this.on('needPeerSend', this._onNeedPeerSend.bind(this));

	this.on('peerReconnection', function(peerId) {
		debug('peerId: %s, ~peerReconnection -> send to peer all message from peer._messageQueue.', peerId);

		var peer = this._peerList[peerId];

		while (peer._messageQueue.length) {
			var message = peer._messageQueue.shift();
			this.emit('needPeerSend', peerId, message);
		}
	}.bind(this));
};

PeersController.prototype._onNeedPeerSend = function(peerId, message) {
	var peer = this._peerList[peerId];
	if (!peer) return debug('peerId: %s - ~needPeerSend, peer not found,\n\t message: %j', peerId, message);

	if (peer._socketId) {
		debug('peerId: %s - ~needPeerSend -> !needSocketSend,\n\t message: %j', peerId, message);
		this.emit('needSocketSend', peer._socketId, message);
	} else {
		debug('peers, id: %s - ~needPeerSend & peer disconnected -> add message to peer._messageQueue,\n\t message: %j', peerId, message);
		peer._messageQueue.push(message);
	}
};

PeersController.prototype.up = function(objectsController) {
	objectsController.on('needPeerSend', this._onNeedPeerSend.bind(this));

	objectsController.on('needPeersBroadcastSend', function(message) {
		debug('~needPeersBroadcastSend -> iterate all peer and !needPeerSend,\n\t message: %j', message);

		for (var peerId in this._peerList) {
			if (this._peerList.hasOwnProperty(peerId) && this._peerList[peerId]) {
				this.emit('needPeerSend', peerId, message);
			}
		}
	}.bind(this));

	return this;
}

PeersController.prototype.down = function(socketsController) {
	socketsController.on('socketMessage', function(socketId, message) {
		var peer = this._findPeer(socketId)

		if (!peer) {
			debug('~socketMessage - peer notAuth -> #_peerAuth, socketId: %s,\n\t messager: %j', socketId, message);

			this._peerAuth(socketId, message);
		} else if (jjv.test('toObjectsControllerMessage', message) && (peer._token === message.token)) {

			var peerId = this._findPeerId(socketId);
			debug('peerId: %s - ~socketMessage -> !peerMessage, socketId: %s,\n\t message: %j', peerId, socketId, message);

			this.emit('peerMessage', peerId, message);
		} else {
			var peerId = this._findPeerId(socketId);

			debug('peerId: %s - ~socketMessage - wrong token -> !needSocketClose, socketId: %s,\n\t message: %j', peerId, socketId, message);
			this.emit('needSocketClose', socketId);
		}

	}.bind(this));

	socketsController.on('socketDisconnection', function(socketId) {
		if (this._findPeer(socketId)) {
			var peerId = this._findPeerId(socketId);

			debug('peerId: %s - ~socketDisconnection -> !peerDisconnection, socketId: %s', peerId, socketId);
			this.emit('peerDisconnection', peerId);
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

PeersController.prototype._peerConnect = function(socketId, message, isAlreadyConnected) {
	var authData = message.args.authData;

	this._authFunc(authData, function(error, result) {
		if (error) {
			debug('#_peerConnect - authFunc returned error: %j, connect aborted -> !needSocketSend - with error info & !needSocketClose, socketId: %s', error, socketId);

			this.emit('needSocketClose', socketId, {
				type: 'internalCallback',
				internalCommand: message.internalCommand,
				error: error
			});
			return this.emit('needSocketClose', socketId);
		}

		if (result !== true) {
			debug('#_peerConnect - authFunc returned false, connect aborted -> !needSocketSend - with error info & !needSocketClose, socketId: %s', socketId);

			this.emit('needSocketSend', socketId, {
				type: 'internalCallback',
				internalCommand: message.internalCommand,
				error: 'auth - fail'
			});
			return this.emit('needSocketClose', socketId);
		}

		var token = generateToken();
		var peerId = this._lastPeerId++;

		var peer = new Peer(socketId, peerId, this._peerDisconnectedTimeout, token)
			.on('timeout', function() {
				delete this._peerList[peerId];
				peer.removeAllListeners().destroy();

				debug('peerId: %s - ~timeout -> !peerDisconnectedTimeout.', peerId);
				this.emit('peerDisconnectedTimeout', peerId);
			}.bind(this));

		this._socketToPeerMap[socketId] = peerId;
		this._peerList[peerId] = peer;

		// one message in - one message out
		// objectsController listenings ~needObjectsSend and emitted
		// !needPeerSend with objects props and new peerId
		if (isAlreadyConnected === true) {
			debug('peerId: %s - #_peerConnect && isAlreadyConnected === true -> !peerConnection & !needSocketSend, socketId: %s,\n\t message: %j',
				peerId, socketId, message);

			this.emit('needSocketSend', socketId, {
				type: 'internalCallback',
				internalCommand: 'reconnect',
				error: null,
				result: {
					newPeerId: peerId,
					newToken: token
				}
			});

			this.emit('peerConnection', peerId);
		} else {
			debug('peerId: %s - #_peerConnect -> !peerConnection & !needObjectsSend, socketId: %s,\n\t message: %j',
				peerId, socketId, message);

			this.emit('needObjectsSend', peerId, token);
			this.emit('peerConnection', peerId);
		}
	}.bind(this))

	function generateToken() {
		return Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
	}
}

PeersController.prototype._peerReconnect = function(socketId, message) {
	var peerId = message.args.peerId;
	var token = message.args.token;

	var peer = this._peerList[peerId];
	if (peer && (peer._token == token)) {
		peer.reconnect(socketId);

		this.emit('needSocketSend', socketId, {
			type: 'internalCallback',
			internalCommand: 'reconnect',
			error: null,
			result: 'reconnected!'
		});

		this._socketToPeerMap[socketId] = peerId;

		debug('peerId: %s - #_peerReconnect -> !peerReconnection, socketId: %s,\n\t message: %j',
			peerId, socketId, message);

		this.emit('peerReconnection', peerId);
	} else if (!peer) {
		debug('peerId: %s - #_peerReconnect - disconnected timeout -> call #_peerConnect, socketId: %s,\n\t message: %j',
			peerId, socketId, message);

		this._peerConnect(socketId, message, true);
	} else {
		debug('peerId: %s - #_peerReconnect - wrong token -> !needSocketSend - with error info, socketId: %s\n\t message: %j',
			peerId, socketId, message);

		this.emit('needSocketSend', socketId, {
			type: 'internalCallback',
			internalCommand: 'reconnect',
			error: 'wrong token'
		});
	}
}

//Peer

util.inherits(Peer, events.EventEmitter);

function Peer(socketId, peerId, peerDisconnectedTimeout, token) {
	this._peerId = peerId;
	this._socketId = socketId;
	this._token = token;
	this._peerDisconnectedTimeout = peerDisconnectedTimeout;
	this._timeoutId = null;
	this._messageQueue = [];
	this._oldSocketId = null;
}

Peer.prototype.disconnect = function() {
	debug('in Peer: peerId: %s, socketId:  %s - #disconnect.', this._peerId, this._socketId);

	this._oldSocketId = this._socketId;
	this._socketId = null;

	this._timeoutId = setTimeout(function() {
		debug('peerId: %s, oldSocketId:  %s - !timeout, peerDisconnectedTimeout: %d.',
			this._peerId, this._oldSocketId, this._peerDisconnectedTimeout);

		this.emit('timeout', this._peerId);
	}.bind(this), this._peerDisconnectedTimeout);

	return this;
}

Peer.prototype.reconnect = function(socketId) {
	debug('in Peer: peerId: %s, oldSocketId: %s - #reconnect, newSocketId: %s.',
		this._peerId, this._oldSocketId, socketId);

	if (this._timeoutId) {
		clearTimeout(this._timeoutId);
		this._timeoutId = null;
	}

	this._socketId = socketId;

	return this;
}

Peer.prototype.destroy = function() {
	debug('in Peer: peerId: %s, oldSocketId:  %s - #destroy.',
		this._peerId, this._oldSocketId);

	if (this._timeoutId) {
		clearTimeout(this._timeoutId);
		this._timeoutId = null;
	}

	this._messageQueue.length = 0;
	this._peerId = null;
	this._socketId = null;
	this._clientTimestamp = null;
	this._peerDisconnectedTimeout = null;
	this._timeoutId = null;
	this._oldSocketId = null;

	return this;
}

//jjv

jjv.addSchema('connect', {
	type: 'object',
	properties: {
		args: {
			type: 'object',
			properties: {
				authData: {
					type: 'any'
				}
			},
			required: ['authData']
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
				authData: {
					type: 'any'
				},
				peerId: {
					type: 'number'
				},
				token: {
					type: 'string'
				}
			},
			required: ['authData', 'peerId', 'token']
		},
		type: {
			type: 'string',
			'enum': ['internalCommand']
		},
		internalCommand: {
			type: 'string',
			'enum': ['reconnect']
		}
	},
	required: ['args', 'internalCommand', 'type']
});

jjv.addSchema('toObjectsControllerMessage', {
	type: 'object',
	properties: {
		token: {
			type: 'string'
		}
	},
	required: ['token']
});

jjv.addType('any', function() {
	return true;
})

jjv.test = function(schema, object) {
	var error = jjv.validate(schema, object);
	if (error) debug('schema %s, error: ', schema, error);

	return !!!error;

	//by default #validate returned error or null
	//i'm returned true - if all ok, or false - if error
}