'use stricts';

/*
	Events:
		
		needPeersBroadcastSend
		needPeerSend


	Listenings:

		down:
			
			peerDisconnectedTimeout
			peerConnection
			peerMessage

*/

var util = require('util');
var events = require('events');
var jjv = require('jjv')();
var debug = require('debug')('TeleportServer:ObjectsController');
var patternMatching = require('pattern-matching');
var assert = require('assert');

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

	this._connectedPeerList = {};

	this._objects = objects;
}

ObjectsController.prototype.down = function(peersController) {
	peersController.on('peerMessage', function(peerId, message) {

	}.bind(this));

	peersController.on('peerConnection', function(peerId, message) {

	}.bind(this));

	return this;
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

			his.isArray(value.events), this.isFunction(value.object.emit));

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
jjv.test = function(schema, object) {
	var error = jjv.validate(schema, object);
	if (error) logger.warn('schema %s, error: ', schema, error);

	return !!!error;

	//by default #validate returned error or null
	//i'm returned true - if all ok, or false - if error
}