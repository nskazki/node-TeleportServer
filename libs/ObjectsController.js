'use stricts';

/*
	Events:
		
		needPeersBroadcastSend
		needPeerSend
	
		objectsControllerDestroyed
		objectsControllerAlreadyDestroyed

	Listenings:

		down:
			
			peerMessage
			needObjectsSend

*/

var util = require('util');
var events = require('events');
var jjv = require('jjv')();
var debug = require('debug')('TeleportServer:ObjectsController');

module.exports = ObjectsController;

util.inherits(ObjectsController, events.EventEmitter);

function ObjectsController(objects) {
	this._objects = objects;
	this._objectsProps = this._formatObjectsProps(objects);
	this._eventsSubscription(objects);

	this._isInit = true;
}

ObjectsController.prototype.destroy = function() {
	if (this._isInit !== true) {
		debug('#destroy -> !objectsControllerAlreadyDestroyed');
		this.emit('objectsControllerAlreadyDestroyed');
		return this;
	}

	this._isInit = false;

	for (var objectName in this._objects) {

		if (this._objects.hasOwnProperty(objectName) &&
			this._objects[objectName].events) {

			for (var eventName in this._objects[objectName].subscrubers) {

				if (this._objects[objectName].subscrubers.hasOwnProperty(eventName)) {

					this._objects[objectName].object.removeListener(
						eventName,
						this._objects[objectName].subscrubers[eventName]
					);
				}
			}
		}
	}

	debug('#destroy -> !objectsControllerDestroyed');
	this.emit('objectsControllerDestroyed')

	return this;
};

ObjectsController.prototype._eventsSubscription = function(_objects) {
	for (var objectName in _objects) {
		if (_objects.hasOwnProperty(objectName) && _objects[objectName].events) {
			_objects[objectName].subscrubers = {};

			_objects[objectName].events.forEach(function(eventName) {

				var subscruber = createEventListener(objectName, eventName).bind(this);
				_objects[objectName].subscrubers[eventName] = subscruber;

				_objects[objectName].object.on(
					eventName,
					subscruber
				);

			}.bind(this));
		}
	}

	function createEventListener(objectName, eventName) {
		return function() {
			debug('!needPeersBroadcastSend. objectName: %s, eventName: %s.',
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
		debug('peerId: %s, ~peerMessage -> #_callCommand,\n\t message: %j', peerId, message);

		if (jjv.test('command', message)) {
			this._callCommand(peerId, message);
		}
	}.bind(this));

	peersController.on('needObjectsSend', function(peerId, token) {
		debug('peerId: %s - ~needObjectsSend -> !needPeerSend.', peerId);

		this.emit('needPeerSend', peerId, {
			type: 'internalCallback',
			internalCommand: 'connect',
			error: null,
			result: {
				peerId: peerId,
				token: token,
				objectsProps: this._objectsProps
			}
		});
	}.bind(this));

	return this;
}

ObjectsController.prototype._callCommand = function(peerId, message) {
	if (this._objectsProps[message.objectName] &&
		(this._objectsProps[message.objectName].methods.indexOf(message.methodName) != -1)) {

		debug('peerId: %s - #_callCommand-init,\n\t message: %j', peerId, message);

		var callback = createCommandCallback(peerId, message).bind(this);
		var args = message.args;
		args.push(callback);

		var object = this._objects[message.objectName].object;
		object[message.methodName].apply(object, args);
	}

	function createCommandCallback(peerId, message) {
		return function(/*error, result*/) {
			var resultToSend = {
				objectName: message.objectName,
				type: "callback",
				methodName: message.methodName,
				requestId: message.requestId,
				// error: error,
				// result: result
				resultArgs: Array.prototype.slice.apply(arguments) 
			};

			debug('peerId: %s - #_callCommand-callback -> !needPeerSend,\n\t message: %j', peerId, message);
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
	if (error) debug('schema %s, error: ', schema, error);

	return !!!error;

	//by default #validate returned error or null
	//i'm returned true - if all ok, or false - if error
}