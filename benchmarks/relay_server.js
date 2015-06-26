// Copyright (c) 2015 Uber Technologies, Inc.

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

'use strict';

var TChannel = require('../channel.js');
var ServiceProxy = require('../hyperbahn/service_proxy.js');
var FakeEgressNodes = require('../test/lib/fake-egress-nodes.js');

var relay = TChannel();
relay.handler = ServiceProxy({
    channel: relay,
    egressNodes: FakeEgressNodes({
        hostPort: '127.0.0.1:4039',
        topology: {
            'benchmark': ['127.0.0.1:4039']
        }
    })
});

relay.handler.createServiceChannel('benchmark');
relay.listen(4039, '127.0.0.1', onListen);

function onListen() {
    var peer = relay.handler.getServicePeer(
        'benchmark', '127.0.0.1:4040'
    );
    peer.connect();
}
