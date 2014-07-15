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
	this._objects = objects;
	this._objectsProps = this._formatObjectsProps(objects);
	this._eventsSubscription(objects);

	this._initAsyncEmit();
}

ObjectsController.prototype._initAsyncEmit = function() {
	var vanullaEmit = this.emit;
	this.emit = function() {
		var asyncArguments = arguments;

		process.nextTick(function() {
			vanullaEmit.apply(this, asyncArguments);
		}.bind(this));
	}.bind(this);
}

ObjectsController.prototype._eventsSubscription = function(_objects) {
	for (var objectName in _objects) {
		if (_objects.hasOwnProperty(objectName) && _objects[objectName].events) {

			_objects[objectName].events.forEach(function(eventName) {

				_objects[objectName].object.on(
					eventName,
					createEventListener(objectName, eventName).bind(this)
				);

			}.bind(this));
		}
	}

	function createEventListener(objectName, eventName) {
		return function() {
			logger.debug('objects, peerId: all, !needPeersBroadcastSend. objectName: %s, eventName: %s.',
				objectName, eventName);

			var args = Array.prototype.slice.call(arguments);

			this.emit('needPeersBroadcastSend', {
				type: 'event',
				objectName: objectName,
				eventName: eventName,
				args: args
			});
		}
	}
}

ObjectsController.prototype._formatObjectsProps = function(_objects) {
	var resultObjects = {};
	for (var objectName in _objects) {
		if (_objects.hasOwnProperty(objectName))
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
		logger.debug('objects, peerId: %s - ~needObjectsSend.', peerId);

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
	if (this._objectsProps[message.objectName] &&
		(this._objectsProps[message.objectName].methods.indexOf(message.methodName) != -1)) {

		logger.debug('objects, peerId: %s - #_callCommand, message: ', peerId, message);

		var callback = commandCallbackCreate(peerId, message).bind(this);
		var args = message.args;
		args.push(callback);

		var object = this._objects[message.objectName].object;
		object[message.methodName].apply(object, args);
	}

	function commandCallbackCreate(peerId, message) {
		return function(error, result) {
			var resultToSend = {
				objectName: message.objectName,
				type: "callback",
				methodName: message.methodName,
				requestId: message.requestId,
				error: error,
				result: result
			};

			logger.debug('objects, peerId: %s - !needPeerSend, message: ', peerId, message);
			this.emit('needPeerSend', peerId, resultToSend);
		}
	};
};

//jjv
jjv.addSchema('command', {
	type: 'object',
	properties: {
		type: {
			type: 'string',
			'enum': ['command']
		},
		methodName: {
			type: 'string'
		},
		objectName: {
			type: 'string'
		},
		args: {
			type: 'array'
		},
		requestId: {
			type: 'number'
		}
	},
	required: ['type', 'methodName', 'objectName', 'args', 'requestId']
});

jjv.test = function(schema, object) {
	var error = jjv.validate(schema, object);
	if (error) logger.warn('schema %s, error: ', schema, error);

	return !!!error;

	//by default #validate returned error or null
	//i'm returned true - if all ok, or false - if error
}