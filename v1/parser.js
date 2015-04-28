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

module.exports = TChannelParser;

var emptyBuffer = new Buffer(0);

var TChannelFrame = require('./frame');

var states = TChannelParser.States = {};
states.readType = 1;
states.readId = 2;
states.readSeq = 3;
states.readArg1len = 4;
states.readArg2len = 5;
states.readArg3len = 6;
states.readCsum = 7;
states.readArg1 = 8;
states.readArg2 = 9;
states.readArg3 = 10;
states.error = 255;

function TChannelParser(connection) {
    this.newFrame = new TChannelFrame();

    this.logger = connection.logger;
    this.state = states.readType;

    this.tmpInt = null;
    this.tmpIntBuf = new Buffer(4);
    this.tmpIntPos = 0;
    this.tmpStr = null;
    this.tmpStrPos = 0;

    this.pos = null;
    this.chunk = null;
}

require('util').inherits(TChannelParser, require('events').EventEmitter);

TChannelParser.prototype.parseError = function(msg) {
    this.emit('error', new Error(msg));
    this.logger.error('parse error: ' + msg);
    this.pos = this.chunk.length;
    this.state = states.error;
};

TChannelParser.prototype.readType = function () {
    var newType = this.chunk[this.pos++];
    this.state = states.readId;
    this.newFrame.header.type = newType;
};

TChannelParser.prototype.readInt = function () {
    if (this.tmpIntPos === 0 && this.chunk.length >= this.pos + 4) {
        this.tmpInt = this.chunk.readUInt32BE(this.pos, true);
        this.pos += 4;
        return;
    }
    while (this.tmpIntPos < 4 && this.pos < this.chunk.length) {
        this.tmpIntBuf[this.tmpIntPos++] = this.chunk[this.pos++];
    }
    if (this.tmpIntPos === 4) {
        this.tmpInt = this.tmpIntBuf.readUInt32BE(0, true);
        this.tmpIntPos = 0;
    }
};

TChannelParser.prototype.readStr = function (len) {
    if (this.tmpStr === null) {
        if ((this.chunk.length - this.pos) >= len) {
            this.tmpStr = this.chunk.slice(this.pos, this.pos + len);
            this.pos += len;
            this.tmpStrPos = len;
        } else {
            this.tmpStr = new Buffer(len);
            this.chunk.copy(this.tmpStr, 0, this.pos, this.chunk.length);
            this.tmpStrPos = this.chunk.length - this.pos;
            this.pos += (this.chunk.length - this.pos);
        }
    } else {
        var bytesToCopy = Math.min(this.chunk.length, (len - this.tmpStrPos));
        this.chunk.copy(this.tmpStr, this.tmpStrPos, this.pos, this.pos + bytesToCopy);
        this.tmpStrPos += bytesToCopy;
        this.pos += bytesToCopy;
    }
};

TChannelParser.prototype.execute = function (chunk) {
    this.pos = 0;
    this.chunk = chunk;
    var header = this.newFrame.header;

    while (this.pos < chunk.length) {
        if (this.state === states.readType) {
            this.readType();
        } else if (this.state === states.readId) {
            this.readInt();
            if (typeof this.tmpInt === 'number') {
                header.id = this.tmpInt;
                this.tmpInt = null;
                this.state = states.readSeq;
            }
        } else if (this.state === states.readSeq) {
            this.readInt();
            if (typeof this.tmpInt === 'number') {
                header.seq = this.tmpInt;
                this.tmpInt = null;
                this.state = states.readArg1len;
            }
        } else if (this.state === states.readArg1len) {
            this.readInt();
            if (typeof this.tmpInt === 'number') {
                header.arg1len = this.tmpInt;
                this.tmpInt = null;
                this.state = states.readArg2len;
            }
        } else if (this.state === states.readArg2len) {
            this.readInt();
            if (typeof this.tmpInt === 'number') {
                header.arg2len = this.tmpInt;
                this.tmpInt = null;
                this.state = states.readArg3len;
            }
        } else if (this.state === states.readArg3len) {
            this.readInt();
            if (typeof this.tmpInt === 'number') {
                header.arg3len = this.tmpInt;
                this.tmpInt = null;
                this.state = states.readCsum;
            }
        } else if (this.state === states.readCsum) {
            this.readInt();
            if (typeof this.tmpInt === 'number') {
                header.csum = this.tmpInt;
                this.tmpInt = null;
                this.state = states.readArg1;
            }
        } else if (this.state === states.readArg1) {
            this.readStr(header.arg1len);
            if (this.tmpStrPos === header.arg1len) {
                this.newFrame.arg1 = this.tmpStr;
                this.tmpStr = null;
                this.tmpStrPos = 0;
                if (header.arg2len === 0 && header.arg3len === 0) {
                    this.emitAndReset();
                    header = this.newFrame.header;
                } else {
                    this.state = states.readArg2;
                }
            }
        } else if (this.state === states.readArg2) {
            this.readStr(header.arg2len);
            if (this.tmpStrPos === header.arg2len) {
                this.newFrame.arg2 = this.tmpStr;
                this.tmpStr = null;
                this.tmpStrPos = 0;
                if (header.arg3len === 0) {
                    this.emitAndReset();
                    header = this.newFrame.header;
                } else {
                    this.state = states.readArg3;
                }
            }
        } else if (this.state === states.readArg3) {
            this.readStr(header.arg3len);
            if (this.tmpStrPos === header.arg3len) {
                this.newFrame.arg3 = this.tmpStr;
                this.emitAndReset();
                header = this.newFrame.header;
            }
        } else if (this.state !== states.error) {
            throw new Error('unknown state ' + this.state);
        }
    }
};

TChannelParser.prototype.emitAndReset = function () {
    this.tmpStr = null;
    this.tmpStrPos = 0;
    if (this.newFrame.header.arg2len === 0) {
        this.newFrame.arg2 = emptyBuffer;
    }
    if (this.newFrame.header.arg3len === 0) {
        this.newFrame.arg3 = emptyBuffer;
    }
    var err = this.newFrame.verifyChecksum();
    if (err) {
        this.emit('error', err);
        return;
    }
    this.emit('frame', this.newFrame);
    this.newFrame = new TChannelFrame();
    this.state = states.readType;
    this.chunk = null;
};
