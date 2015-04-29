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

'use strict';

function setupRawTestService(chan) {
    if (!chan.serviceName) {
        chan = chan.makeSubChannel({
            serviceName: 'test_as_raw'
        });
    }
    chan.register('echo', echo);
    chan.register('streaming_echo', {
        streamed: true
    }, streamingEcho);
}

function echo(req, buildRes, arg2, arg3) {
    var res = buildRes();
    res.headers.as = 'raw';
    if (req.headers.as !== 'raw') {
        res.sendError('BadRequest', 'expected as=raw transport header');
    } else {
        res.sendOk(req.arg2, req.arg3);
    }
}

function streamingEcho(req, buildRes) {
    if (!req.streamed) {
        echo(req, buildRes, req.arg2, req.arg3);
    } else if (req.headers.as !== 'raw') {
        buildRes().sendError('BadRequest', 'expected as=raw transport header');
    } else {
        var res = buildRes({streamed: true});
        res.headers.as = 'raw';
        res.setOk(true);
        res.sendStreams(req.arg2, req.arg3);
    }
}

module.exports = setupRawTestService;
