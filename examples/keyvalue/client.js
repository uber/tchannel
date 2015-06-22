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
var fs = require('fs');
var path = require('path');
var process = require('process');
var console = require('console');

var TChannel = require('../../');
var HyperbahnClient = require('../../hyperbahn/');

var thriftSource = fs.readFileSync(
    path.join(__dirname, 'keyvalue.thrift'), 'utf8'
);

function Client() {
    if (!(this instanceof Client)) {
        return new Client();
    }

    var self = this;

    self.logger = DebugLogtron('keyvalue');
    self.rootChannel = TChannel({
        logger: self.logger
    });
    self.hyperbahnClient = HyperbahnClient({
        tchannel: self.rootChannel,
        serviceName: 'keyvalue-client',
        hostPortList: ['127.0.0.1:21301'],
        hardFail: true,
        logger: self.logger
    });

    self.keyThrift = self.rootChannel.TChannelAsThrift({
        source: thriftSource,
        channel: self.hyperbahnClient.getClientChannel({
            serviceName: 'keyvalue'
        })
    });
}

Client.prototype.get = function get(key, cb) {
    var self = this;

    self.keyThrift.request({
        serviceName: 'keyvalue',
        timeout: 100,
        hasNoParent: true
    }).send('KeyValue::get_v1', null, {
        key: key
    }, cb);
};

Client.prototype.put = function put(key, value, cb) {
    var self = this;

    self.keyThrift.request({
        serviceName: 'keyvalue',
        timeout: 100,
        hasNoParent: true
    }).send('KeyValue::put_v1', null, {
        key: key,
        value: value
    }, cb);
};

Client.prototype.destroy = function destroy() {
    var self = this;

    self.rootChannel.close();
};

if (require.main === module) {
    main(process.argv.slice(2));
}

function main(args) {
    /*eslint no-console: 0*/
    var client = Client();

    if (args[0] === 'get') {
        client.get(args[1], onGet);
    } else if (args[0] === 'put') {
        client.put(args[1], args[2], onSet);
    }

    function onGet(err, resp) {
        if (err) {
            throw err;
        }

        console.log('onGet', resp);
        client.destroy();
    }

    function onSet(err, resp) {
        if (err) {
            throw err;
        }

        console.log('onSet', resp);
        client.destroy();
    }
}
