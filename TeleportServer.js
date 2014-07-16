/**
	https://github.com/nskazki/node-TeleportServer
	MIT
	from russia with love, 2014
*/


/**

	Public:

		destroy

	Events:

		serverReady
		serverError
		serverDestroyed

		peerReconnection
		peerDisconnection
		peerConnectionion
		peerDisconnectedTimeout
*/

"use strict";

var SocketsController = require('./libs/SocketsController');
var PeersController = require('./libs/PeersController');
var ObjectsController = require('./libs/ObjectsController');

var util = require('util');
var events = require('events');
var assert = require('assert');

var _ = require('lodash');
var patternMatching = require('pattern-matching');

var debug = require('debug')('TeleportServer:Main');

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

module.exports = TeleportServer;

util.inherits(TeleportServer, events.EventEmitter);

function TeleportServer(params) {
	assert(patternMatching(params, {
		peerDisconnectedTimeout: 'integer',
		port: 'integer',
		objects: 'teleportedObjects'
	}), 'does not match pattern.');

	this._params = params;

	this._objectsController = new ObjectsController(params.objects);
	this._socketsController = new SocketsController(params.port);
	this._peersController = new PeersController(params.peerDisconnectedTimeout);

	this._socketsController.up(this._peersController);
	this._peersController.down(this._socketsController).up(this._objectsController);
	this._objectsController.down(this._peersController);

	this._isInit = true;

	this._initAsyncEmit();
	this._bindOnControllersEvents();
}

TeleportServer.prototype.destroy = function() {
	if (this._isInit === true) {
		this._isInit = false;

		this._objectsController.destroy();
		this._socketsController.destroy(); //-> serverDestroyed
		this._peersController.destroy();

		this.on('serverDestroyed', function() {
			this._objectsController.removeAllListeners();
			this._socketsController.removeAllListeners();
			this._peersController.removeAllListeners();

			this._objectsController = null;
			this._socketsController = null;
			this._peersController = null;
		}.bind(this));
	}

	return this;
};

TeleportServer.prototype._initAsyncEmit = function() {
	var vanullaEmit = this.emit;
	this.emit = function() {
		var asyncArguments = arguments;

		process.nextTick(function() {
			vanullaEmit.apply(this, asyncArguments);
		}.bind(this));
	}.bind(this);
}

TeleportServer.prototype._bindOnControllersEvents = function() {
	this._createEvetnsProxy(
		this._peersController, ['peerReconnection', 'peerDisconnection', 'peerConnection', 'peerDisconnectedTimeout']
	);

	this._createEvetnsProxy(
		this._socketsController, ['serverReady', 'serverError', 'serverDestroyed']
	);
}

TeleportServer.prototype._createEvetnsProxy = function(object, events) {
	events.forEach(function(eventName) {
		object.on(
			eventName,
			this._createEventProxy(eventName).bind(this)
		);
	}.bind(this));
}

TeleportServer.prototype._createEventProxy = function(eventName) {
	return function() {
		var arg = Array.prototype.slice.call(arguments);
		this.emit.apply(this, [eventName].concat(arg));
	}
}

//patternMatching
patternMatching.isTeleportedObjects = function(value) {
	if (!this.isNotEmptyObject(value)) return false;
	return _.values(value).every(function(value) {
		if (!this.isNotEmptyObject(value)) return false;

		if (!value.hasOwnProperty('object') ||
			!this.isObject(value.object)) return false;

		if (!value.hasOwnProperty('events') &&
			!value.hasOwnProperty('methods')) return false;

		if (value.hasOwnProperty('events')) {
			if (!this.isArray(value.events) ||
				!this.isFunction(value.object.emit)) return false;
		}

		if (value.hasOwnProperty('methods')) {
			if (!this.isArray(value.methods)) return false;

			if (!value.methods.every(function(method) {
				return this.isFunction(value.object[method]);
			}.bind(this))) return false;
		}

		return true;
	}.bind(this));
};