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

var test = require('tape');

var TChannel = require('../channel.js');

test('listening on a used port', function t(assert) {
    var otherServer = TChannel();
    var server = TChannel();

    otherServer.on('listening', onPortAllocated);
    otherServer.listen(0, 'localhost');

    function onPortAllocated() {
        server.on('error', onError);

        server.listen(otherServer.address().port, 'localhost');
    }

    function onError(err) {
        assert.notEqual(-1, err.message
            .indexOf('tchannel: listen EADDRINUSE'));
        assert.equal(err.type, 'tchannel.server.listen-failed');
        assert.equal(err.requestedPort,
            otherServer.address().port);
        assert.equal(err.host, 'localhost');
        assert.equal(err.code, 'EADDRINUSE');
        assert.equal(err.errno, 'EADDRINUSE');
        assert.equal(err.syscall, 'listen');
        assert.notEqual(-1, err.origMessage
            .indexOf('listen EADDRINUSE'));

        server.close();
        otherServer.close();
        assert.end();
    }
});
