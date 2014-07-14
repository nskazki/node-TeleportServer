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
var WebSocketServer = require('socket.io');
var util = require('util');
var events = require('events');
var _ = require('lodash');
var patternMatching = require('pattern-matching');
var assert = require('assert');


var Peers = require('./lib/Peers');
var InternalCommandHandler = require('./lib/InternalCommandHandler');
var CoreServer = require('./lib/CoreServer');

//end require

module.exports = TeleportServer;

function TeleportServer(options) {

	//options
	assert(patternMatching(options, {
		'port': 'integer',
		'objects': 'teleportedObjects'
	}), '\'options\' - parametr does not match the pattern');
	this._optionWsServerPort = options.port;
	this._optionObjects = options.objects;


	if (_.isUndefined(options.clientLatency)) {
		this._optionsClientLatency = 4 * 60 * 1000;
	} else {
		assert((patternMatching(options.clientLatency, 'integer') ||
				(options.clientLatency === false)),
			'\'options.clientLatency\' - parameter type not is integer or equal of false.');
		this._optionsClientLatency = options.clientLatency;
	}


	if (_.isUndefined(options.autoRestart)) {
		this._optionAutoRestart = 10 * 1000;
	} else {
		assert((patternMatching(options.autoRestart, 'integer') ||
				(options.clientLatency === false)),
			'\'options.autoRestart\' - parameter type not is integer or equal of false.');
		this._optionAutoRestart = options.clientLatency;
	}

	//end options

	//variables
	this._valueWsServer = null;
	this._valueWsPeers = [];

	this._valueTimestamp = null;

	this._valueIsInit = false;
	this._valueIsReadyEmited = false;

	//end variables
}

patternMatching.isTeleportedObjects = function(value) {
	//console.log(value);

	if (!this.isNotEmptyObject(value)) return false;
	//console.log(1);

	return _.values(value).every(function(value) {
		//console.log(value);

		if (!this.isNotEmptyObject(value)) return false;

		//console.log(2);

		if (!value.hasOwnProperty('object') ||
			!this.isObject(value.object)) return false;

		//console.log(3);

		if (!value.hasOwnProperty('events') &&
			!value.hasOwnProperty('methods')) return false;

		//console.log(4, this.isArray(value.events), this.isFunction(value.object.emit));

		if (value.hasOwnProperty('events')) {
			if (!this.isArray(value.events) ||
				!this.isFunction(value.object.emit)) return false;
		}

		//console.log(5);

		if (value.hasOwnProperty('methods')) {
			if (!this.isArray(value.methods)) return false;

			if (!value.methods.every(function(method) {
				return this.isFunction(value.object[method]);
			}.bind(this))) return false;
		}

		//console.log(6);

		return true;
	}.bind(this));
};

TeleportServer.prototype.init = function() {
	if (!this._valueIsInit) {
		this._valueTimestamp = new Date();
		this._funcWsServerInit();
		this._funcEmitterInit();

		this._valueIsInit = true;
	}

	return this;
};

TeleportServer.prototype.destroy = function() {
	throw new Error('DISABLED, because #close method dont work in socket.io server ');

	/*
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

		this._valueWsPeers.forEach(function(peer) {
			if (peer) peer.destroy();
		});

		this._valueWsPeers = [];
		this._valueIsReadyEmited = false;
		this._valueTimestamp = null;
		this._valueIsInit = false;

		if (this._valueWsServer) {
			this._funcWsServerClose();
			this.emit('close');
		}

		this.emit('destroyed');

		
	}

	return this;
	*/
}

TeleportServer.prototype._funcEmitterInit = function() {
	Object.keys(this._optionObjects).forEach(function(objectName) {
		var object = this._optionObjects[objectName].object;
		var events = this._optionObjects[objectName].events;

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
	}.bind(this));
};

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

