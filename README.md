TeleportServer
=======

```
npm install teleport-server --save
```
[TeleportClient](https://github.com/nskazki/web-TeleportClient)

<h5>Это RPC сервер, умеет:</h5>
 * Сообщать клиенту о доступных объектах, их методах, типах выбрасываемых событий.
 * Сообщать подключенным клиентом о выбрасываемых объектами событиях.
 * Выполнять на сервере вызванные клиентом методы и возвращать результат.

<h5>Ограничения:</h5>
 * Работает только с объектами.
 * Работает только с асинхронными методоми объктов, принимающими callback и неограниченное количество аргументов.
 * Выбрасываемые события могут содержать неограниченное количество аргументов.
 * Все аргументы передоваемые на сервер и результаты возвращаемые на клиента проходят через JSON.stringify -> JSON.parse.

<h5>Example:</h5>
```js
var teleportServer = new TeleportServer({
	objects: {
		'logBox': {
			object: logBox,
			methods: ['getDateBounds', 'getLogs'],
		},
		'ipBox': {
			object: ipBox,
			events: ['newIps']
		},
		'blackBox': {
			object: rainbowBox,
			methods: ['getColor'],
			events: ['newColor']
		}
	},
	port: 8000,
	isDebug: false
}).on('error', function(error) {
	errorLogger('teleportServer - error', error);
}).on('warn', function(warn) {
	warnLogger('teleportServer - warn', warn);
}).on('info', function(info) {
	infoLogger('teleportServer - info', info);
}).on('debug', function(bebug) {
	debugLogger('teleportServer - bebug', bebug);
}).init();
```

<h5>Заметка к Example:</h5>
 * <code>errorLogger</code>,  <code>warnLogger</code>,  <code>infoLogger</code> и <code>debugLogger</code>, это функции созданные функциями высшего порядка класса [MyLogger](https://github.com/nskazki/node-MyLogger).

<h5>Публичные методы:</h5>
 * `init` - метод инициирующий объект.

<h5>Events:</h5>
 * `info` - оповещения информационного характера, в частности о готовности к работе ws сервера. Выбрасывается с одним аргументом, содержашим информационные подробности.
 * `warn` - оповещение о проблемах не влияющих на дальнейшую нормальную работу программы. Например: если от клиента поступило некорректная команда. Выбрасывается с одним аргументом.
 * `error` - оповещение о проблемах которые делают программу неработоспособной, в частности ошибки Web Socket сервера. Выбрасывается с одним аргументом.
 * `debug` - оповещения о клиент-серверном обмене сообщениями. Выбрасывается с одним аргументом.

 * `ready` - оповещение о том, что сервер готов к работе. Без аргументов.
 * `newClientConnected` - оповещение о том, что с сервером установил соединение новый клиент. Без аргументов.