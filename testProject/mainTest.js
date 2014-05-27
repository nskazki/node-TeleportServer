"use strict";

var TeleportServer = require('teleport-server');
var MyLogger = require('my-logger');

var util = require('util');
var events = require('events');
var colors = require('colors');

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
	}.bind(this), 10000);

	return this;
};

//end SimpleObject

//main
//	simpleObject
var simpleObject = new SimpleObject({
	foo: 'bar'
}).initIntervalEventEmitter();

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
			methods: ['simpleAsyncFunc'],
			events: ['myOptions']
		}
	}
}).on('error', function(error) {
	errorLogger('teleportServer - error', error);
}).on('warnLogger', function(warn) {
	warnLogger('teleportServer - warn', warn);
}).on('info', function(info) {
	infoLogger('teleportServer - info', info);
}).on('debug', function(bebug) {
	debugLogger('teleportServer - bebug', bebug);
}).init();

//	end teleportServer

//end main;