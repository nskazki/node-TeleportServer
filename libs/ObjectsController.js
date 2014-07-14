'use stricts';

/*
	Events:
		
		needPeersBroadcastSend
		needPeerSend


	Listenings:

		down:
			
			peerMessage
			needObjectsSend

*/

var util = require('util');
var events = require('events');
var jjv = require('jjv')();
var debug = require('debug')('TeleportServer:ObjectsController');
var patternMatching = require('pattern-matching');
var assert = require('assert');
var _ = require('lodash');

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

module.exports = ObjectsController;

util.inherits(ObjectsController, events.EventEmitter);

function ObjectsController(objects) {
	assert(patternMatching(objects, 'teleportedObjects'), 'objects - does not match teleportedObjects pattern.');

	this._objects = objects;
	this._objectsProps = this._formatObjectsProps(objects);
}

ObjectsController.prototype._formatObjectsProps = function(_objects) {
	var resultObjects = {};
	for (var objectName in _objects) {
		resultObjects[objectName] = {
			methods: _objects[objectName].methods,
			events: _objects[objectName].events
		}
	}

	return resultObjects;
}

ObjectsController.prototype.down = function(peersController) {
	peersController.on('peerMessage', function(peerId, message) {
		logger.debug('objects, peerId: %s, ~peerMessage, message: ', peerId, message);

		if (jjv.test('command', message)) {
			this._callCommand(peerId, message);
		}
	}.bind(this));

	peersController.on('needObjectsSend', function(peerId) {
		this.emit('needPeerSend', peerId, {
			type: 'internalCallback',
			internalCommand: 'connect',
			error: null,
			result: this._objectsProps
		});
	}.bind(this));

	return this;
}

ObjectsController.prototype._callCommand = function(peerId, message) {
	if (this._objectsProps[message.object] &&
		(this._objectsProps[message.object].methods.indexOf(message.command) != -1)) {

		logger.debug('object, peerId: %s, #_callCommand, message: ', peerId, message);

		var callback = commandCallbackCreate(peerId, message).bind(this);
		var args = message.args;
		args.push(callback);

		var object = this._objects[message.object].object;
		object[message.command].apply(object, args);
	}

	function commandCallbackCreate(peerId, message) {
		return function(error, result) {
			var resultToSend = {
				object: message.object,
				type: "callback",
				command: message.command,
				requestId: message.requestId,
				error: error,
				result: result
			};

			logger.debug('object, peerId: %s - !needPeerSend, message: ', peerId, message);
			this.emit('needPeerSend', peerId, resultToSend);
		}
	};
};

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


//jjv
jjv.addSchema('command', {
	type: 'object',
	properties: {
		type: {
			type: 'string',
			'enum': ['command']
		},
		command: {
			type: 'string'
		},
		object: {
			type: 'string'
		},
		args: {
			type: 'array'
		},
		requestId: {
			type: 'number'
		}
	},
	required: ['type', 'command', 'object', 'args', 'requestId']
});

jjv.test = function(schema, object) {
	var error = jjv.validate(schema, object);
	if (error) logger.warn('schema %s, error: ', schema, error);

	return !!!error;

	//by default #validate returned error or null
	//i'm returned true - if all ok, or false - if error
}