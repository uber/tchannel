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

/* Provides a class for sending and handling multicast UDP messages of one or
 * more caller specified types (maximum 256).
 *
 * The format on the wire is:
 *     type:1 {body} checksum:4
 * - body is arbitrary and read/written by the specified body RW corresponding
 *   to the type.
 * - checksum is the CRC32-C checksum of all prior bytes (type + body
 *
 * Example "chat" application:
 *
 *     var bufrw = require('bufrw');
 *
 *     var myid = Math.floor(Math.random() * 0xffffffff);
 *
 *     var ctl = new MultiCTL({
 *         1: bufrw.Struct({
 *             id: bufrw.UInt32BE,
 *             msg: bufrw.str2
 *         }),
 *     }, 12345, ['239.0.0.1']);
 *     ctl.send(1, {id: myid, msg: '(joins)'});
 *
 *     ctl.on('frame', function onFrame(type, body) {
 *         if (body.id !== myid) {
 *             console.log('%s> %s', body.id, body.msg);
 *         }
 *     });
 *
 *     var lines = process.stdin.pipe(require('split2')());
 *     lines.on('data', function onLine(line) {
 *         ctl.send(1, {id: myid, msg: line});
 *     });
 *     lines.on('end', function onEnd() {
 *         ctl.send(1, {id: myid, msg: '(leaves)'});
 *         ctl.close();
 *     });
 *
 */

var CRC32C = require("sse4_crc32").calculate;
var EventEmitter = require('events').EventEmitter;
var bufrw = require('bufrw');
var dgram = require('dgram');
var inherits = require('util').inherits;

// note assumes that buffer being read is rooted @0
var ChecksumPrior = {
    byteLength: function checksumLength() {
        return bufrw.UInt32BE.byteLength();
    },
    writeInto: function writePriorChecksum(obj, buffer, offset) {
        var checksum = CRC32C(buffer.slice(0, offset));
        return bufrw.UInt32BE.writeInto(checksum, buffer, offset);
    },
    readFrom: function readPriorChecksum(obj, buffer, offset) {
        var res = bufrw.UInt32BE.readFrom(buffer, offset);
        if (!res.err) {
            var expected = res.value;
            var got = CRC32C(buffer.slice(0, offset));
            if (got !== expected) {
                return bufrw.ReadResult.rangedError(new Error(
                    'checksum mismatch, expected ' + expected + ' got ' + got
                ), offset, res.offset);
            }
        }
        return res;
    }
};

function MultiCTL(bodyCases, port, addresses) {
    var self = this;
    EventEmitter.call(self);

    // type:1 {body} checksum:4
    self.frameRW = bufrw.Struct([
        {call: bufrw.Switch(bufrw.UInt8, bodyCases, {
            valKey: 'type',
            dataKey: 'body',
            structMode: true
        })},
        {name: 'checksum', call: ChecksumPrior}
    ]);

    self.port = port;
    self.addresses = addresses;
    self.socket = dgram.createSocket('udp4', onMessage);
    self.socket.bind(port, function onBound() {
        for (var i = 0; i < self.addresses.length; i++) {
            self.socket.addMembership(self.addresses[i]);
        }
    });
    function onMessage(buf, rinfo) {
        self.onMessage(buf, rinfo);
    }
}
inherits(MultiCTL, EventEmitter);

MultiCTL.prototype.close = function close(callback) {
    var self = this;
    self.socket.close(callback);
};

MultiCTL.prototype.onMessage = function onMessage(buf, rinfo) {
    var self = this;
    bufrw.fromBufferResult(self.frameRW, buf).toCallback(function parsed(err, frame) {
        if (err) {
            self.emit('error', err);
            return;
        }
        self.emit('frame', frame.type, frame.body, rinfo);
    });
};

MultiCTL.prototype.send = function send(type, body) {
    var self = this;
    var frame = {
        type: type,
        body: body,
        checksum: 0
    };
    bufrw.toBufferResult(self.frameRW, frame).toCallback(function wrote(err, buf) {
        if (err) {
            self.emit('error', err);
            return;
        }
        for (var i = 0; i < self.addresses.length; i++) {
            self.socket.send(buf, 0, buf.length, self.port, self.addresses[i]);
        }
    });
};

module.exports = MultiCTL;
