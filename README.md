TeleportServer
=======

```
npm install teleport-server --save
```

<h5>Это RPC сервер, умеет:</h5>
 * Сообщать клиенту о доступных объектах, их методах, типах выбрасываемых событий.
 * Сообщать подключенным клиентом о выбрасываемых объектами событиях.
 * Выполнять на сервере вызванные клиентом методы и возвращать результат.

<h5>Ограничения:</h5>
 * Работает только с объектами.
 * Работает только с асинхронными методоми объктов, принимающими не больше одного аргумента и callback.

<h5>Пояснение к Example:</h5>
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
