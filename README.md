TeleportServer
=======

```
npm install teleport-server --save
```
[TeleportClient](https://github.com/nskazki/web-TeleportClient)

<h5>Переезд на socket.io</h5>
Для подхватывание оперы и ie до 10, переезжаю.
Переезд повлек проблемы, неработающие фичи помечанны так: `DISABLED`

<h5>Это RPC сервер, умеет:</h5>
 * Сообщать клиенту о именах телепортируемых объектов, их методах, типах выбрасываемых событий.
 * Сообщать подключенным клиентам о выбрасываемых объектами событиях.
 * Выполнять на сервере вызванные клиентом методы и возвращать результат.

<h5>Ограничения:</h5>
 * Работает только с объектами.
 * Работает только с асинхронными методами объктов, принимающими неограниченное количество аргументов и callback.
 * Выбрасываемые объектами события могут содержать неограниченное количество аргументов.
 * Все аргументы передаваемые на сервер и результаты возвращаемые на клиента проходят через JSON.stringify -> JSON.parse.

<h5>Кил фича:</h5>
Если соединение с сервером кратковременно оборвется, то:
 * Клиент получит все выброшенные телепортированными объектами события за время отсутствия соединения.
 * Если клиентом был вызван некоторый метод до обрыва соединения, 
 	<br>то после переподключения он получит результат этого вызова.
 * Если клиент вызовет метод телепортированного объекта во время отсутствия соединения, 
 	<br>то он будет вызван когда соединение восстановится.

<h5>Example:</h5>
```js
var teleportServer = new TeleportServer({
	port: 8000,
	clientLatency: 10*60*1000,
	//autoRestart: 3000, DISABLED
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
	}
}.on('error', function(error) {
	errorLogger('teleportServer - error', error);
}).on('warn', function(warn) {
	warnLogger('teleportServer - warn', warn);
}).init();
```
<h5>Заметка к Example:</h5>
 * <code>errorLogger</code>,  <code>warnLogger</code>, это функции созданные функциями высшего порядка класса [MyLogger](https://github.com/nskazki/node-MyLogger).

<h5>Параметры принимаемые конструктором:</h5>
 * `port` - порт на котором core сервер будет ожидать подключений клиентов.
 	<br>Разрешенное значение: число.
	<br>default: `8000`

 * `clientLatency` - время ожидания переподключения клиента, если это время истекает,
	<br>то все накопленные для потерянного клиента данные очищаются.
	<br>Разрешенные значения:
 	* если `false` - переподключение будет ожидаться бесконечно.
 	* если число - то это время ожидания в миллисекундах.
 	* dafault: `4*60*1000`

 * `DISABLED` - `autoRestarter` - время задержки перед автоматическим перезапускам core сервера после возможного сбоя.
  	<br>(сервера непосредственно принимающего и передающего сообщения клиентами, а не TeleportServer) 
	<br>Разрешенные значения: 	
	* если `false` - перезапуск произведен не будет.
 	* если число - то это время задержки в миллисекундах.
 	* default: `10*1000`

 * `objects` - объект где:
 	* имя поля (`logBox`, `ipBox`, `blackBox`) - это имя под которым телепортированные объект получат клиенты.
 	* `object` - сслыка на передаваемый объект.
 	* `events` - массив событий разрешенных к передаче клиентам. Если указанно `true`, то будет переданны все события.
 	* `methods` - массив методов разрешенных для вызова клиентами. 

<h5>Публичные методы:</h5>
 * `init` - метод инициирующий объект.
 * `DISABLED` - `destroy` - метод прекращающий работу объекта.

<h5>Info events:</h5>
Эти события выбрасываются с одним аргументом, объектом, cодержащим:
 * поле `desc`, раскрывающим суть события. 
 * дополнительные поля раскрывающие внутреннее состояние TeleportServer.

События:
 * `info` - оповещения информационного характера, в частности о готовности к работе ws сервера.
 * `warn` - оповещение о проблемах не влияющих на дальнейшую нормальную работу программы.
 * `error` - оповещение о проблемах которые делают программу неработоспособной, в частности ошибки Web Socket сервера.
 * `debug` - оповещения о клиент-серверном обмене сообщениями.

<h5>State events:</h5>
Эти события отражают текущее состояние TeleportServer.
<br>Выбрасываются без аргументов.

 * `ready` - оповещение о том, что сервер готов к подключению клиентов.
 * `close` - прекратил работу core сервер, все соединения с клиентами закрылись.<br>Будет выброшенно если:
    * Произошел сбой WS Server и `autoRestarter = false`.
    * Вызван метод `destroy` и при этом core сервер еще работал.
 * `DISABLED` - `destroyed` - объект сервера разрушен, подписки на события серверных объектов сняты, все соединения с клиентами закрыты.
 * `DISABLED` - `restarting` - произошел сбой WS Server и скоро будет предпринята попытка перезапуска.
 * `DISABLED` - `restarted` - после сбоя WS Server его работа восстановленна.

<h5>Client events:</h5>
Эти события выбрасываются при подключении\переподключении\истечении времени ожидания переподключения клиентов.<br>
Выбрасываемый аргумент - id клиента.

 * `clientConnected` - подключился новый клиент.
 * `clientReconnected` - клиент переподключился после дисконекта. 
 <br>Все данные подготовленные к отправке для него будут отправленны, все накопленные клиентом команды будут приняты.
 * `clientReconnectionTimeout` - истекло время ожидания переподключения клиента. 
 <br>Все данные для него подготовленные будут очищенны, если клиент все таки переподключется ему придется регистрироваться на серере заново.
 * `clientDisconnected` - клиент отключился, возможно он еще переподключится.
