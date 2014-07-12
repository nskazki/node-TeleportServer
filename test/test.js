var assert = require('assert');
var TeleportServer = require('..');

try {
	var TeleportClient = require('../../TeleportClient/');
} catch (ex) {
	var TeleportClient = require('teleport-client');
}

//in soket.io@1.0.6 server dont work #close method 
var port = 20000;

//tests
describe('create server', function() {

	describe('correct new', function() {

		it('obj with func', function() {
			var teleportServer = new TeleportServer({
				port: port,
				objects: {
					'blank': {
						object: new ClassWithFunc(),
						methods: ['simpleFunc']
					}
				}
			});
		});


		it('obj with events', function() {
			var teleportServer = new TeleportServer({
				port: port,
				objects: {
					'blank': {
						object: new ClassWithEvents(),
						events: ['simpleEvent']
					}
				}
			});
		});


		it('obj with events and func', function() {
			var teleportServer = new TeleportServer({
				port: port,
				objects: {
					'blank': {
						object: new ClassWithFuncAndEvents(),
						methods: ['simpleFunc'],
						events: ['simpleEvent']
					}
				}
			});
		});

		it('all options', function() {
			var teleportServer = new TeleportServer({
				port: port,
				objects: {
					'blank': {
						object: new ClassWithFuncAndEvents(),
						methods: ['simpleFunc'],
						events: ['simpleEvent']
					}
				},
				clientLatency: 20 * 1000,
				autoRestart: 10 * 1000
			});
		});

	});

	describe('incorrect new', function() {
		describe('port', function() {
			it('broken port', function(done) {
				try {
					var teleportClient = new TeleportServer({
						port: 19.9,
						objects: {
							'blank': {
								object: new ClassWithFunc(),
								methods: ['simpleFunc']
							}
						}
					});

					done(new Error('new server with broken port'));
				} catch (ex) {
					done();
				}
			});

			it('without port', function(done) {
				try {
					var teleportClient = new TeleportServer({
						objects: {
							'blank': {
								object: new ClassWithFunc(),
								methods: ['simpleFunc']
							}
						}
					});

					done(new Error('new server without port'));
				} catch (ex) {
					done();
				}
			});
		});

		describe('optional params', function() {
			it('broken clientLatency', function(done) {
				try {
					var teleportClient = new TeleportServer({
						port: port,
						objects: {
							'blank': {
								object: new ClassWithFunc(),
								methods: ['simpleFunc']
							}
						},
						clientLatency: 19.9
					});

					done(new Error('new server with broken clientLatency'));
				} catch (ex) {
					done();
				}
			});

			it('broken autoRestart', function(done) {
				try {
					var teleportClient = new TeleportServer({
						port: port,
						objects: {
							'blank': {
								object: new ClassWithFunc(),
								methods: ['simpleFunc']
							}
						},
						autoRestart: 19.9
					});

					done(new Error('new server with broken autoRestart'));
				} catch (ex) {
					done();
				}
			});
		});

		describe('objects - wrong type', function() {
			it('broken objects - not object', function(done) {
				try {
					var teleportClient = new TeleportServer({
						port: port,
						objects: '{ blank: {object: {} } }'
					});

					done(new Error('new server with broken objects'));
				} catch (ex) {
					done();
				}
			});

			it('broken objects - empty object', function(done) {
				try {
					var teleportClient = new TeleportServer({
						port: port,
						objects: {}
					});

					done(new Error('new server with broken objects'));
				} catch (ex) {
					done();
				}
			});
		});

		describe('object - wrong fields', function() {

			it('without events and methods fields', function(done) {
				try {
					var teleportClient = new TeleportServer({
						port: port,
						objects: {
							'blank': {
								object: new ClassWithFunc()
							}
						}
					});

					done(new Error('new server with wrong objects'));
				} catch (ex) {
					done()
				}
			});

			it('without object fields', function(done) {
				try {
					var teleportClient = new TeleportServer({
						port: port,
						objects: {
							'blank': {
								methods: ['simpleFunc'],
								events: ['events']
							}
						}
					});

					done(new Error('new server with wrong objects'));
				} catch (ex) {
					done()
				}
			});
		});

		describe('objects - description not match content', function() {
			it('objects: func, desc: events', function(done) {
				try {
					var teleportClient = new TeleportServer({
						port: port,
						objects: {
							'blank': {
								object: new ClassWithFunc(),
								events: ['simpleEvent']
							}
						}
					});

					done(new Error('new server with wrong objects'));
				} catch (ex) {
					done()
				}
			});

			it('objects: events, desc: func', function(done) {
				try {
					var teleportClient = new TeleportServer({
						port: port,
						objects: {
							'blank': {
								object: new ClassWithEvents(),
								methods: ['simpleEvent']
							}
						}
					});

					done(new Error('new server with wrong objects'));
				} catch (ex) {
					done()
				}
			});
		});
	});
});

describe('server handles incomming message', function() {
	var teleportServer, ws, onMessage;

	before(function() {
		teleportServer = createTeleportServer(port);
		ws = new WsMock();
		onMessage = teleportServer._funcWsOnMessageCreate(ws).bind(teleportServer);
	});

	it('some responce', function(done) {
		ws
			.once('okSend', done)
			.once('errorSend', done);

		onMessage('{}')
	});

});

describe('client-server handshake', function() {
	beforeEach(function() {
		port++;
	});

	it.skip('connect to server', function(done) {
		var teleportServer = createTeleportServer(port);
		var teleportClient = createTeleportClient(port).on('ready', function() {
			done();
		});
	});
});

//end tests

//sugar
function createTeleportClient(port) {
	var url = 'ws://localhost:'

	var teleportClient = new TeleportClient({
			serverAddress: url + port
		})
		.on('error', function(error) {
			console.log('teleportServer - error', error);
		});

	return teleportClient;
}

function createTeleportServer(port) {
	var teleportServer = new TeleportServer({
		port: port,
		objects: {
			'blank': {
				object: new ClassWithFuncAndEvents(),
				methods: ['simpleFunc'],
				events: ['simpleEvent']
			}
		},
		clientLatency: 20 * 1000,
		autoRestart: 10 * 1000
	}).on('error', function(error) {
		console.log('teleportServer - error', error);
	});

	return teleportServer;
};

//end sugar

//blank
var util = require('util');
var events = require('events');


//ws mock
util.inherits(WsMock, events.EventEmitter);

function WsMock(state) {
	if (typeof state === 'undefined') state = true;
	this.connected = state;
};

WsMock.prototype.send = function(message, callback) {
	if (this.connected) {
		this.emit('okSend', null, message);
		return callback();
	} else {
		this.emit('errorSend', message);
		return callback(new Error('connection is closed'));
	}
}

//end ws mock

//
function ClassWithFunc() {}

ClassWithFunc.prototype.simpleFunc = function(callback) {
	callback();
};

//
util.inherits(ClassWithFuncAndEvents, events.EventEmitter);

function ClassWithFuncAndEvents() {}

ClassWithFuncAndEvents.prototype.simpleFunc = function(callback) {
	callback();
};

//
util.inherits(ClassWithEvents, events.EventEmitter);

function ClassWithEvents() {}

//
function EmptyClass() {}

//end blank