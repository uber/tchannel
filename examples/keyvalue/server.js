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

var DebugLogtron = require('debug-logtron');
var myLocalIp = require('my-local-ip');
var fs = require('fs');
var path = require('path');

var TChannel = require('../../');
var HyperbahnClient = require('../../hyperbahn/');

var thriftSource = fs.readFileSync(
    path.join(__dirname, 'keyvalue.thrift'), 'utf8'
);

function Application() {
    if (!(this instanceof Application)) {
        return new Application();
    }

    var self = this;

    self.logger = DebugLogtron('keyvalue');
    self.rootChannel = TChannel({
        logger: self.logger
    });

    self.keyValueChannel = self.rootChannel.makeSubChannel({
        serviceName: 'keyvalue'
    });
    self.keyThrift = self.rootChannel.TChannelAsThrift({
        source: thriftSource
    });

    self.keyThrift.register(
        self.keyValueChannel, 'KeyValue::get_v1', self, self.get
    );
    self.keyThrift.register(
        self.keyValueChannel, 'KeyValue::put_v1', self, self.put
    );

    self.hyperbahnClient = HyperbahnClient({
        tchannel: self.rootChannel,
        serviceName: 'keyvalue',
        hostPortList: ['127.0.0.1:21301'],
        hardFail: true,
        logger: self.logger
    });

    self.store = {};
}

Application.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    self.rootChannel.listen(0, myLocalIp(), onListen);

    function onListen() {
        self.hyperbahnClient.once('advertised', cb);
        self.hyperbahnClient.advertise();
    }
};

Application.prototype.get = function get(app, req, head, body, cb) {
    app.logger.info('get request', {
        body: body
    });

    cb(null, {
        ok: true,
        body: {
            value: app.store[body.key]
        }
    });
};

Application.prototype.put = function put(app, req, head, body, cb) {
    app.logger.info('put request', {
        body: body
    });
    app.store[body.key] = body.value;

    cb(null, {
        ok: true,
        body: null
    });
};

if (require.main === module) {
    main();
}

function main() {
    var app = Application();
    app.bootstrap(function onBootstrap() {
        app.logger.info('started application', {
            port: app.rootChannel.address().port
        });
    });
}
