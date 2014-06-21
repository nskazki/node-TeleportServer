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
	if (!callback) callback = param;

	callback(null, {
		name: 'simpleFunc',
		receivedParam: param,
		internalOptions: this.options,
	});
};

SimpleObject.prototype.simpleFuncWithUnlimArgs = function() {
	var args = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
	var callback = arguments[arguments.length - 1];

	callback(null, {
		name: 'simpleFuncWithUnlimArgs',
		receivedParam: args,
		internalOptions: this.options
	});
};

SimpleObject.prototype.simpleFuncWithoutArgs = function(callback) {
	callback(null, {
		name: 'simpleFuncWithoutArgs',
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

SimpleObject.prototype.initIntevralEvent = function() {
	setInterval(function() {
		this.emit('10secIntervalEvent');
	}.bind(this), 1000 * 10);

	return this;
};

SimpleObject.prototype.simpleFuncWith10SecDelay = function(callback) {
	setTimeout(function() {
		callback(null, {
			name: 'simpleFuncWith10SecDelay',
			internalOptions: this.options
		});
	}.bind(this), 1000 * 10);

	return this;
}

SimpleObject.prototype.serverDestroy = function() {
	teleportServer.destroy();

	return this;
};

SimpleObject.prototype.serverCoreDestroy = function() {
	teleportServer._valueWsServer.close();

	return this;
}

//end SimpleObject

//main
//	simpleObject
var simpleObject = new SimpleObject({
	foo: 'bar'
}); //.initIntevralEvent();

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
	restart: {
		isUse: true,
		delay: 3000
	},
	objects: {
		'simpleObject': {
			object: simpleObject,
			methods: [
				'simpleFunc',
				'simpleFuncWithUnlimArgs', 'simpleFuncWithoutArgs',
				'simpleFuncWith10SecDelay',
				'serverDestroy', 'serverCoreDestroy'
			],
			events: [
				'eventWithMyOptions', 'eventWithoutArgs',
				'eventWithUnlimArgs',
				'10secIntervalEvent'
			]
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
	/*		simpleObject
			.emitEventWithoutArgs()
			.emitEventWithOptions()
			.emitEventWithUnlimArgs();*/
}).init();

//	end teleportServer

//end main;