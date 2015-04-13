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

var path = require('path');
var tape = require('tape');
var TChannel = require('../channel.js');
var EndpointHandler = require('../endpoint-handler.js');
var TChannelAsThrift = require('../as/thrift.js');
var thriftify = require('thriftify');

function NoEchoError(value) {
    var err = new Error('No echo');
    err.nameAsThrift = 'noEcho';
    err.value = value;
    return err;
}

function echo(opts, head, body, cb) {
    return cb(null, {ok: true, body: body.value});
}

function noEcho(opts, head, body, cb) {
    return cb(null, {ok: false, body: NoEchoError(body.value)});
}

tape('send and receive thrift an ok service call', function (assert) {

    var client = new TChannel();
    var server = new TChannel({
        handler: new EndpointHandler()
    });

    var spec = thriftify.readSpecSync(path.join(__dirname, 'anechoic-chamber.thrift'));
    var tchannelAsThrift = new TChannelAsThrift({spec: spec});
    tchannelAsThrift.register(server.handler, 'Chamber::echo', null, echo);

    server.listen(0, '127.0.0.1', function () {

        tchannelAsThrift.send(client.request({
            host: server.hostPort
        }), 'Chamber::echo', null, {value: 10}, handleResponse);

        function handleResponse(err, res) {
            if (err) return done(err);
            assert.ok(res.ok);
            assert.equals(res.body, 10);
            done();
        }

    });

    function done(err) {
        if (err) {
            assert.ifErr(err);
        }
        server.close();
        assert.end();
    }
});

tape('send and receive thrift a not ok service call', function (assert) {

    var client = new TChannel();
    var server = new TChannel({
        handler: new EndpointHandler()
    });

    var spec = thriftify.readSpecSync(path.join(__dirname, 'anechoic-chamber.thrift'));
    var tchannelAsThrift = new TChannelAsThrift({spec: spec});
    tchannelAsThrift.register(server.handler, 'Chamber::echo', null, noEcho);

    server.listen(4040, '127.0.0.1', function () {

        tchannelAsThrift.send(client.request({
            host: server.hostPort
        }), 'Chamber::echo', null, {value: 10}, handleResponse);

        function handleResponse(err, res) {
            if (err) return done(err);
            assert.ok(!res.ok);
            assert.equals(res.body.value, 10);
            done();
        }

    });

    function done(err) {
        if (err) {
            assert.ifErr(err);
        }
        server.close();
        assert.end();
    }
});
