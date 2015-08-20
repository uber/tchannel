// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

var net = require('net');
var fork = require('child_process').fork;

var test = require('tape');
var TChannel = require('../index.js');

test('make listen-on-fd socket', {timeout: 2000}, function t(assert) {
    var child, client, port;
    var serverOptions = {host: '127.0.0.1', port: 4040, listening: false};
    var clientOptions = {host: '127.0.0.1', port: 4041, listening: false};
    var serverName = serverOptions.host + ':' + serverOptions.port;
    var socket = new net.createServer();
    socket.listen(0, onListen);

    function onListen() {
        port = socket.address().port;
        child = fork(__filename.replace(/.js$/, '-child.js'), ['child']);
        child.on('message', sendTest);
        child.send(port.toString(), socket._handle);
    }

    function sendTest(port) {
        client = new TChannel(clientOptions);
        serverName = serverOptions.host + ':' + port;
        client.send({host: serverName, timeout: 25000}, 'endpoint', null, null, onTestResponse);
    }

    function onTestResponse(err, res1) {
        assert.ok(res1.toString() === 'ok', 'result is ok');
        assert.notOk(err);
        assert.end();
        client.quit();
        child.kill();
        socket.close();
    }
});
