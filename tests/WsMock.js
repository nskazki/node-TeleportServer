'use strict';

var util = require('util');
var events = require('events');
module.exports = WsMock;


util.inherits(WsMock, events.EventEmitter);


function WsMock(isConnected) {
	if (isConnected !== false) isConnected = true;

	this._isConnected = isConnected;
}

WsMock.prototype.send = function(message, callback) {
	if (this._isConnected) {
		callback();
		this.emit('okSend');
	} else {
		var error = new Error('connect - closed');

		callback(error);
		this.emit('errorSend', error);
	}
}