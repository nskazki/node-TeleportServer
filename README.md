TeleportServer
=======

Это RPC сервер, умеет: 
 * вызывать методы серверных объектов
 * сообщать подключенным клиентом о выбрасываемых объектами событиях

Конструктор класса TeleportServer, принимает единственным параметром объект с опциями.
Возвращает новый неинециализированный объект класса TeleportServer.

<h5>Example</h5>
```js
var teleportServer = new TeleportServer({
	objects: {
		'logBox': {
			object: logBox,
			methods: ['getDateBounds', 'getLogs'],
			events: ['newDateBounds']
		},
		'ipBox': {
			object: ipBox,
			methods: ['getIps'],
			events: ['newIps']
		}
	},
	port: 8000,
	isDebug: false
}).on('error', function(error) {
	errorLogger('teleportServer - error', error);
}).on('warnLogger', function(warn) {
	warnLogger('teleportServer - warn', warn);
}).on('info', function(info) {
	ingoLogger('teleportServer - info', info);
}).on('debug', function(bebug) {
	debugLogger('teleportServer - bebug', bebug);
}).init();
```
