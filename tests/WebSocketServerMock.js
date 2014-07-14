'use strict';

var util = require('util');
var events = require('events');
var WsMock = require('./WsMock');

module.exports = WebSocketServerMock;


util.inherits(WebSocketServerMock, events.EventEmitter);

function WebSocketServerMock(port, isNeedError) {
	this._port = port;

	if (isNeedError) this.emit('error', new Error('some error!'));
}