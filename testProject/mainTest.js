"use strict";

var TeleportServer = require('../TeleportServer.js'); //teleport-server
var MyLogger = require('my-logger');

var util = require('util');
var events = require('events');
var colors = require('colors');

//SimpleObject
util.inherits(SimpleObject, events.EventEmitter);

function SimpleObject(options) {
	this.options = options;
};

SimpleObject.prototype.simpleFunc = function(param, callback) {
	callback(null, {
		receivedParam: param,
		internalOptions: this.options,
	});
};

SimpleObject.prototype.simpleFuncWithUnlimArgs = function() {
	var args = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
	var callback = arguments[arguments.length - 1];

	callback(null, {
		receivedParam: args,
		internalOptions: this.options
	});
};

SimpleObject.prototype.simpleFuncWithoutArgs = function(callback) {
	callback(null, {
		internalOptions: this.options
	});
};

SimpleObject.prototype.emitEventWithOptions = function() {
	this.emit('eventWithMyOptions', this.options);

	return this;
};

SimpleObject.prototype.emitEventWithoutArgs = function() {
	this.emit('eventWithoutArgs');

	return this;
};

SimpleObject.prototype.emitEventWithUnlimArgs = function() {
	this.emit('eventWithUnlimArgs', false, 1, '2', {
		3: '>:3'
	}, new Date());

	return this;
};

//end SimpleObject

//main
//	simpleObject
var simpleObject = new SimpleObject({
	foo: 'bar'
})
	.emitEventWithOptions()
	.emitEventWithoutArgs();

//	end simpleObject

//	loggers
var infoLogger = new MyLogger.Informer('mainTest');
var errorLogger = new MyLogger.Panic('mainTest');
var warnLogger = new MyLogger.Warning('mainTest');
var debugLogger = new MyLogger.CusotomLogger('mainTest', "DEBG", colors.cyan);

//	end loggers

//	teleportServer
var teleportServer = new TeleportServer({
	port: 8000,
	isDebug: true,
	objects: {
		'simpleObject': {
			object: simpleObject,
			methods: ['simpleFunc', 'simpleFuncWithUnlimArgs', 'simpleFuncWithoutArgs'],
			events: ['eventWithMyOptions', 'eventWithoutArgs', 'eventWithUnlimArgs']
		}
	}
}).on('error', function(error) {
	errorLogger('teleportServer - error', error);
}).on('warn', function(warn) {
	warnLogger('teleportServer - warn', warn);
}).on('info', function(info) {
	infoLogger('teleportServer - info', info);
}).on('debug', function(bebug) {
	debugLogger('teleportServer - bebug', bebug);
}).on('newClientConnected', function() {
	simpleObject
		.emitEventWithoutArgs()
		.emitEventWithOptions()
		.emitEventWithUnlimArgs();
}).init();

//	end teleportServer

//end main;