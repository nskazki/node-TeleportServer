TeleportServer
=======

```
npm install teleport-server --save
```
[TeleportClient](https://github.com/nskazki/web-TeleportClient)

<h5>Это RPC сервер, умеет:</h5>
 * Авторизовывать клиентов.
 * Сообщать клиенту о именах телепортируемых объектов, их методах, типах выбрасываемых событий.
 * Сообщать подключенным клиентам о выбрасываемых объектами событиях.
 * Выполнять на сервере вызванные клиентом методы и возвращать результат.

<h5>Ограничения:</h5>
 * Работает только с объектами.
 * Работает только с асинхронными методами объктов, принимающими неограниченное количество аргументов и callback.
 * Выбрасываемые объектами события могут содержать неограниченное количество аргументов.
 * Все аргументы передаваемые на сервер и результаты возвращаемые на клиента проходят через JSON.stringify -> JSON.parse.
 * Авторизация обязательно, я серьезно передавайте в качестве авторизационных данных хотя бы имя проекта, 
 	<br>не стреляйте себе в ногу лишний раз.
 * Указывать время по истечении которого клиент считается безвозвратно отключенным обязательно, 
 	<br>по истечении этого времени очищается буфер выброшенных телепортируемыми объектами событий и невозвращенных результатов вызванных этим клиентом методов.

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
	peerDisconnectedTimeout: 10*60*1000,
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
	authFunc: function(authData, callback) {
		callback(null, authData === 'example project');
	}
});
```
<h5>Параметры принимаемые конструктором:</h5>
 * `port` - порт на котором core сервер будет ожидать подключений клиентов.

 * `peerDisconnectedTimeout` - время ожидания переподключения клиента в миллисекундах, если это время истекает,
	<br>то все накопленные для потерянного клиента данные очищаются.

 * `objects` - объект где:
 	* имя поля (`logBox`, `ipBox`, `blackBox`) - это имя под которым телепортированные объект получат клиенты.
 	* `object` - сслыка на передаваемый объект.
 	* `events` - массив событий разрешенных к передаче клиентам. Если указанно `true`, то будет переданны все события.
 	* `methods` - массив методов разрешенных для вызова клиентами. 

 * `authFunc` - функция авторизующая подключаемых клиентов.

<h5>Публичные методы:</h5>
 * `destroy` - метод прекращающий работу объекта.

<h5>State events:</h5>
Эти события отражают текущее состояние TeleportServer.

 * `ready` - оповещение о том, что сервер готов к подключению клиентов.
 * `destroyed` - объект сервера разрушен, подписки на события серверных объектов сняты, все соединения с клиентами закрыты.
 * `alreadyDestroyed` - ранее метод `destroyed` уже вызывался.
 * `error` - оповещение о ошибках socket.io сервера.

<h5>Client events:</h5>
Эти события выбрасываются при подключении\переподключении\истечении времени ожидания переподключения клиентов.<br>
Выбрасываемый аргумент - id клиента.

 * `clientConnection` - подключился новый клиент.
 * `clientReconnection` - клиент переподключился после дисконекта. 
 <br>Все данные подготовленные к отправке для него будут отправленны, все накопленные клиентом команды будут приняты.
 * `clientDisconnectedTimeout` - истекло время ожидания переподключения клиента. 
 <br>Все данные для него подготовленные будут очищенны, если клиент все таки переподключется ему придется регистрироваться на серере заново.
 * `clientDisconnection` - клиент отключился, возможно он еще переподключится.

<h5>How to debug:</h5>

DEBUG=TeleportServer* npm test