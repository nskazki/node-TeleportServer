<!-- START docme generated API please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN docme TO UPDATE -->

<div>
<div class="jsdoc-githubify">
<section>
<article>
<div class="container-overview">
<dt>
<h4 class="name" id="TeleportServer"><span class="type-signature"></span>new TeleportServer<span class="signature">(options)</span><span class="type-signature"> &rarr; {<a href="TeleportServer.html">TeleportServer</a>}</span></h4>
</dt>
<dd>
<div class="description">
<p>RPC сервер, умеет вызывать методы серверных объектов и сообщать подключенным клиентом о выбрасываемых объектами событиях
<br>
Конструктор класса TeleportServer, принимает единственным параметром объект с опциями,
возвращает новый неинециализированный объект класса TeleportServer</p>
</div>
<h5>Parameters:</h5>
<table class="params">
<thead>
<tr>
<th>Name</th>
<th>Type</th>
<th class="last">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td class="name"><code>options</code></td>
<td class="type">
<span class="param-type">Object</span>
</td>
<td class="description last"><p>object containing the parameters to initialize the TeleportServer class</p>
<h6>Properties</h6>
<table class="params">
<thead>
<tr>
<th>Name</th>
<th>Type</th>
<th class="last">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td class="name"><code>isDebug</code></td>
<td class="type">
<span class="param-type">Boolean</span>
</td>
<td class="description last"><p>if true, the object will emit debug events.</p></td>
</tr>
<tr>
<td class="name"><code>port</code></td>
<td class="type">
<span class="param-type">Number</span>
</td>
<td class="description last"><p>port that the server will listen.</p></td>
</tr>
<tr>
<td class="name"><code>objects</code></td>
<td class="type">
<span class="param-type">Object</span>
</td>
<td class="description last"><p>object containing information about currently available to the TeleportClient objects.
Field names are arbitrary.</p>
<h6>Properties</h6>
<table class="params">
<thead>
<tr>
<th>Name</th>
<th>Type</th>
<th class="last">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td class="name"><code>someObjectName</code></td>
<td class="type">
<span class="param-type">Object</span>
</td>
<td class="description last"><p>arbitrary field name containing a information about the teleported object.</p>
<h6>Properties</h6>
<table class="params">
<thead>
<tr>
<th>Name</th>
<th>Type</th>
<th class="last">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td class="name"><code>object</code></td>
<td class="type">
<span class="param-type">Object</span>
</td>
<td class="description last"><p>contains an object whose methods will be available to the RPC client.</p></td>
</tr>
<tr>
<td class="name"><code>methods</code></td>
<td class="type">
<span class="param-type">Array.&lt;string></span>
</td>
<td class="description last"><p>contains an array of methods.
methods should return the result of the work of the Callback function.</p></td>
</tr>
<tr>
<td class="name"><code>events</code></td>
<td class="type">
<span class="param-type">Array.&lt;string></span>
</td>
<td class="description last"><p>contains an array of allowed events to be transferred to the RPC client.</p></td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>
<dl class="details">
<dt class="tag-version">Version:</dt>
<dd class="tag-version"><ul class="dummy"><li>0.1.2</li></ul></dd>
<dt class="tag-author">Author:</dt>
<dd class="tag-author">
<ul>
<li>nskazki@gmail.com</li>
</ul>
</dd>
<dt class="tag-source">Source:</dt>
<dd class="tag-source"><ul class="dummy">
<li>
<a href="https://github.com/MyNodeComponents/TeleportServer/blob/master/TeleportServer.js">TeleportServer.js</a>
<span>, </span>
<a href="https://github.com/MyNodeComponents/TeleportServer/blob/master/TeleportServer.js#L65">lineno 65</a>
</li>
</ul></dd>
</dl>
<h5>Returns:</h5>
<dl>
<dt>
Type
</dt>
<dd>
<span class="param-type"><a href="TeleportServer.html">TeleportServer</a></span>
</dd>
</dl>
<h5>Example</h5>
<pre class="prettyprint"><code>var teleportServer = new TeleportServer({
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
}).init();</code></pre>
</dd>
</div>
<dl>
<dt>
<h4 class="name" id="init"><span class="type-signature"></span>init<span class="signature">()</span><span class="type-signature"> &rarr; {<a href="TeleportServer.html">TeleportServer</a>}</span></h4>
</dt>
<dd>
<div class="description">
<p>Инициализирующий метод, вызывающий приватный инициализирующие методы класса.
А имеенно создает web socket сервер и выполняет monkey patching EventEmittera переданных в опциях объектов.</p>
</div>
<dl class="details">
<dt class="tag-source">Source:</dt>
<dd class="tag-source"><ul class="dummy">
<li>
<a href="https://github.com/MyNodeComponents/TeleportServer/blob/master/TeleportServer.js">TeleportServer.js</a>
<span>, </span>
<a href="https://github.com/MyNodeComponents/TeleportServer/blob/master/TeleportServer.js#L90">lineno 90</a>
</li>
</ul></dd>
</dl>
<h5>Returns:</h5>
<dl>
<dt>
Type
</dt>
<dd>
<span class="param-type"><a href="TeleportServer.html">TeleportServer</a></span>
</dd>
</dl>
</dd>
</dl>
</article>
</section>
</div>

*generated with [docme](https://github.com/thlorenz/docme)*
</div>
<!-- END docme generated API please keep comment here to allow auto update -->