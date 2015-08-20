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

var TChannel = require('../index.js');

// just in case, always die.
setTimeout(process.exit.bind(null, 0), 5000);
process.on('disconnect', process.exit);

process.on('message', doListen);

function doListen(port, socket) {
    var serverOptions = {host: '127.0.0.1', port: parseInt(port), listening: false};
    var server = new TChannel(serverOptions);

    server.register('endpoint', function(x, y, z, cb) { cb(null, 'ok'); });
    server.on('socketClose', process.exit.bind(process));
    server.serverSocket.on('listening', process.send.bind(process, port));
    server.listen({ fd: socket.fd });
}
