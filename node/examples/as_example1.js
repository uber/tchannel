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

var TChannelJSON = require('../as/json');
var TChannel = require('../');

var server = TChannel({
    serviceName: 'server'
});
var client = TChannel();
var tchannelJSON = TChannelJSON();

var context = {};

tchannelJSON.register(server, 'echo', context, echo);
function echo(context, req, head, body, callback) {
    callback(null, {
        ok: true,
        head: head,
        body: body
    });
}

server.listen(4040, '127.0.0.1', onListening);

function onListening() {
    tchannelJSON.send(client.request({
        serviceName: 'server',
        host: '127.0.0.1:4040'
    }), 'echo', {
        head: 'object'
    }, {
        body: 'object'
    }, onResponse);

    function onResponse(err, resp) {
        if (err) {
            console.log('got error', err);
        } else {
            console.log('got resp', resp);
        }

        server.close();
    }
}
