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
var TChannel = require('../channel.js');

test('make listen-on-fd socket', function t(assert) {
    assert.timeoutAfter(2000);
    var child, client, port, serverName, subChannel;
    var serverOptions = {host: 'localhost', port: 'no', listening: false};
    var clientOptions = {host: 'localhost', port: 4041, listening: false};
    var socket = new net.createServer();
    socket.listen(0, onListen);

    function onListen() {
        port = socket.address().port;
        child = fork(__filename.replace(/.js$/, '-child.js'), ['child']);
        child.on('message', sendTest);
        child.send(port.toString(), socket._handle);
    }

    function sendTest(port) {
        serverName = serverOptions.host + ':' + port;
        client = new TChannel(clientOptions);
        subChannel = client.makeSubChannel({ serviceName: 'service' });
        subChannel.waitForIdentified({ host: serverName }, onIdentified);
    }

    function onIdentified(err) {
        assert.notOk(err, 'no error in identified');
        subChannel.request({
            host: serverName,
            serviceName: 'service',
            hasNoParent: true,
            timeout: 2000,
            headers: {
                as: 'raw',
                cn: 'parent'
            }
        }).send('endpoint', null, null, onTestResponse);
    }

    function onTestResponse(err, resp, arg2) {
        assert.notOk(err, 'no error in response');
        assert.ok(arg2 && arg2.toString() === 'ok', 'result is ok');
        assert.end();
        client.quit();
        child.kill();
        socket.close();
    }
});
