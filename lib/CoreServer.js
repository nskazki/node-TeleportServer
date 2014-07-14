TeleportServer.prototype._funcWsServerInit = function() {
	this._valueWsServer = new WebSocketServer(this._optionWsServerPort);

	//onerror
	var onerror = (function(error) {
		this.emit("error", {
			desc: "TeleportServer: Web Socket сервер выбросил ошибку.",
			error: error
		});

		/*
		DISABLED, because #close method dont work in socket.io server 
		if (this._optionAutoRestart == false) {
			this._funcWsServerClose();
			this.emit('close');
		} else this._funcWsServerRestart();
		*/
	});

	this._valueWsServer.on('error', onerror.bind(this));
	this._valueWsServer.sockets.on('error', onerror.bind(this));

	//onclose
	var onclose = (function() {
		this.emit("info", {
			desc: "TeleportServer: Web Socket был закрыт.",
		});

		/*
		DISABLED, because #close method dont work in socket.io server 
		
		if (this._optionAutoRestart == false) {
			this._funcWsServerClose();
			this.emit('close');
		} else this._funcWsServerRestart();
		*/

		//temporary solution
		this.emit('close');
		//
	});

	this._valueWsServer.on('close', onclose.bind(this));
	this._valueWsServer.sockets.on('close', onclose.bind(this));

	//onconnection
	this._valueWsServer.sockets.on('connection', function(ws) {
		ws
			.on('message', this._funcWsOnMessageCreate(ws).bind(this))
			.on('error', function(err) {
				this.emit('debug', {
					desc: "TeleportServer: Произошла ошибка соединения с пиром",
					error: err
				});
			}.bind(this))
			.on('disconnect', function() {
				this.emit('debug', {
					desc: "TeleportServer: Отключился один из пиров"
				});
			}.bind(this));
	}.bind(this));

	/*
	DISABLED, because socket.io can not notify about server starts.
	
	this._valueWsServer.httpServer.on('listening', function() {
		this.emit('info', {
			desc: "TeleportServer: Ws Server - запущен",
			port: this._optionWsServerPort
		});

		if (!this._valueIsReadyEmited) {
			this.emit('ready');
			this._valueIsReadyEmited = true;
		} else {
			this.emit('restarted');
		}
	}.bind(this));
	*/

	//temporary solution
	this.emit('info', {
		desc: "TeleportServer: Ws Server - запущен",
		port: this._optionWsServerPort
	});
	this.emit('ready');
	this._valueIsReadyEmited = true;
	//
};

TeleportServer.prototype._funcWsOnMessageCreate = function(ws) {
	return function(sourceMessage) {
		try {
			var message = JSON.parse(sourceMessage);
		} catch (ex) {
			var errorInfo = ({
				desc: "TeleportServer: not valid JSON message.",
				sourceMessage: sourceMessage
			});

			this.emit('warn', errorInfo);
			return this._funcWsSend(ws, {
				error: errorInfo
			});
		}

		this.emit('debug', {
			desc: "TeleportServer: recived message from the peer.",
			message: message
		});

		if (!patternMatching(message, {
			type: 'notEmptyString'
		})) {
			var errorInfo = ({
				desc: "TeleportServer: invalid format message.",
				message: message
			});

			this.emit('warn', errorInfo);
			return this._funcWsSend(ws, {
				error: errorInfo
			});
		}

		if (message.type == "command") {
			this._funcCommandHandler(ws, message);
		} else if (message.type == "internalCommand") {
			this._funcInternalCommandHandler(ws, message);
		} else {
			var errorInfo = ({
				desc: "TeleportServer: for message of this type there is no handler.",
				message: message
			});

			this.emit('warn', errorInfo);
			return this._funcWsSend(ws, {
				error: errorInfo
			});
		}
	};
};


TeleportServer.prototype._funcWsServerRestart = function() {
	throw new Error('DISABLED, because #close method dont work in socket.io server ');
	/*
	this.emit('restarting');

	this.emit('warn', {
		desc: "Будет выполненн перезапуск сервера.",
		delay: this._optionAutoRestart,
	});

	this._funcWsServerClose();

	setTimeout(this._funcWsServerInit.bind(this), this._optionAutoRestart);
	*/
};

TeleportServer.prototype._funcWsServerClose = function() {
	throw new Error('DISABLED, because #close method dont work in socket.io server ');

	/*
	this._valueWsServer
		.removeAllListeners('listening')
		.removeAllListeners('error')
		.removeAllListeners('connection');

	try {
		this._valueWsServer._server
			.removeAllListeners('close');

		this._valueWsServer.close();
	} catch (err) {}

	this._valueWsServer = null;
	*/
};

TeleportServer.prototype._funcWsSend = function(ws, message) {
	if (ws.connected) {
		ws.send(
			JSON.stringify(message),
			wsSendedCreate(message).bind(this));
	} else {
		var string = (JSON.stringify(message).length > 400) ? (JSON.stringify(message).substring(0, 400) + "...") : message;
		this.emit("debug", {
			desc: "TeleportServer: Сообщение приру отправлено не будет так как соединение с ним закрылось.",
			toSend: string
		});
	}

	function wsSendedCreate(toSend) {
		return function(error) {
			if (error) {
				var string = (JSON.stringify(toSend).length > 400) ? (JSON.stringify(toSend).substring(0, 400) + "...") : toSend;

				this.emit('warn', {
					desc: "TeleportServer: Во время отправки сообщения пиру произошла ошибка.",
					error: error,
					toSend: string
				});
			} else {
				this.emit('debug', {
					desc: "TeleportServer: Отправка сообщения пиру прошла успешно.",
					type: toSend.type,
					command: toSend.command,
					internalCommand: toSend.internalCommand,
					event: toSend.event
				});
			}
		};
	};
}