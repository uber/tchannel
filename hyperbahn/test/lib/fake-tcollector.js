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

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var spec = fs.readFileSync(
    path.join(__dirname, 'tcollector.thrift'), 'utf8'
);

module.exports = FakeTCollector;

function FakeTCollector(options) {
    if (!(this instanceof FakeTCollector)) {
        return new FakeTCollector(options);
    }

    var self = this;

    assert(typeof options === 'object', 'options required');
    assert(typeof options.channel === 'object', 'options.channel required');

    self.channel = options.channel;

    self.thrift = new self.channel.TChannelAsThrift({
        source: spec
    });

    self.thrift.register(
        self.channel,
        'TCollector::submit',
        self,
        function onSubmit(opts, req, head, body, done) {
            self.onSubmit(opts, req, head, body, done);
        }
    );

    self.traces = [];
}

FakeTCollector.prototype.onSubmit =
function onSubmit(opts, req, head, body, done) {
    var self = this;

    self.traces.push(body.span);
    done(null, {ok: true, body: {ok: true}});
};
