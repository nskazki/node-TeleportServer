"use strict";

var TeleportServer = require('../TeleportServer');
var util = require('util');
var events = require('events');

//SimpleObject
util.inherits(SimpleObject, events.EventEmitter);

function SimpleObject(options) {
	this.options = options;
};

SimpleObject.prototype.simpleAsyncFunc = function(param, callbaclk) {
	callbaclk({
		receivedParam: param,
		internalOptions: this.options,
	});
};

SimpleObject.prototype.initIntervalEventEmitter = function() {
	setInterval(function() {
		this.emit('myOptions', this.options);
	}.bind(this), 3000);

	return this;
};

//end SimpleObject

//main
var simpleObject = new SimpleObject({
	foo: 'bar'
}).initIntervalEventEmitter();

var teleportServer = new TeleportServer({
	port: 8000,
	isDebug: true,
	objects: {
		'simpleObject': {
			object: simpleObject,
			methods: 'simpleAsyncFunc',
			events: 'myOptions'
		}
	}
}).on('error', function(error) {
	console.log(error);
}).on('warnLogger', function(warn) {
	console.log(warn);
}).on('info', function(info) {
	console.log(info);
}).on('debug', function(bebug) {
	console.log(bebug);
}).init();;

//end main;