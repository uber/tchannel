#!/usr/bin/env node

// -- structure to track outstanding "operations"

function Oper(opts, send) {
    var self = this;
    self.id = 0;
    self.ops = {};
    self.max = opts.max;
    self.timeout = opts.timeout;
    self.nextTime = Infinity;
    self.timer = null;
    self.send = send;
}

Oper.prototype.finish = function finish(id, err, result) {
    var self = this;
    var op = self.ops[id];
    if (op) {
        op.finish = Date.now();
        delete self.ops[id];
        op.callback(err, op, result);
        // TODO: only reset timer if needed
        self.onTimeout();
    }
};

Oper.prototype.add = function add(callback) {
    var self = this;
    var id = self.nextId();
    if (self.ops[id]) {
        callback(new Error('duplicate operation'));
        return;
    }
    var now = Date.now();
    var op = self.ops[id] = {
        id: id,
        start: now,
        finish: 0,
        deadline: now + self.timeout,
        callback: callback
    };
    self.updateTimer(op.deadline);
    return op;
};

Oper.prototype.nextId = function nextId() {
    var self = this;
    self.id = (self.id + 1) % self.max;
    return self.id;
};

Oper.prototype.updateTimer = function updateTimer(nextTime) {
    var self = this;
    if (nextTime < self.nextTime) {
        self.nextTime = nextTime;
        var timeout = Math.max(0, self.nextTime - Date.now());
        clearTimeout(self.timer);
        self.timer = setTimeout(onTimeout, timeout);
    }
    function onTimeout() {
        self.onTimeout();
    }
};

Oper.prototype.onTimeout = function onTimeout() {
    var self = this;
    var ids = Object.keys(self.ops);
    var nextTime = self.nextTime = Infinity;
    for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var op = self.ops[id];
        if (op.deadline < Date.now()) {
            delete self.ops[id];
            op.callback(new Error('timed out'), op, null);
        } else {
            nextTime = Math.min(nextTime, op.deadline);
        }
    }
    self.updateTimer(nextTime);
};

// -- frame read/write definitions

var CRC32C = require("sse4_crc32").calculate;
var bufrw = require('bufrw');

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

// node:4 type:1 {body} checksum:4
var BodyCases = {};
var FrameRW = bufrw.Struct([
    {name: 'node', rw: bufrw.UInt32BE},
    {call: bufrw.Switch(bufrw.UInt8, BodyCases, {
        valKey: 'type',
        dataKey: 'body',
        structMode: true
    })},
    {name: 'checksum', call: ChecksumPrior}
]);

// TODO: an init protocol for de-conflicting random ids
// id 1 / 2 reserved for such

// A raw binary ping/pong message for MTU discovery
// id:4 buf~2
var PingOverhead = 4 + 1 + 4 + 2 + 4;
var PingType = 3;
var PongType = 4;
var pingRW = bufrw.Struct({
    id: bufrw.UInt32BE,
    buf: bufrw.buf2
});
BodyCases[PingType] = pingRW;
BodyCases[PongType] = pingRW;

// A normal string message body
var MessType = 5;
BodyCases[MessType] = bufrw.Struct({
    msg: bufrw.str2
});

// --- main program

var dgram = require('dgram');

var argv = require('minimist')(process.argv.slice(2));
var split2 = require('split2');

if (argv._.length < 2) {
    console.error('usage chatter port address [address [...]]');
    process.exit(1);
}
var port = parseInt(argv._[0]);
if (!port) {
    console.error('invalid port');
    process.exit(1);
}
var addresses = argv._.slice(1);

var socket = dgram.createSocket('udp4', onMessage);
socket.bind(port, bound);

var ready = false;
var myId = Math.random() * Math.pow(2, 32);
var pings = new Oper({
    timeout: 100,
    max: 0xffffffff
}, function sendPing(buf, callback) {
    var self = this;
    var ping = self.add(callback);
    ping.sentBuf = buf;
    send(PingType, {
        id: ping.id,
        buf: buf
    });
});

var probingMTU = false;
var knownGoodMTU = 0;

function handleFrame(remoteAddr, frame) {
    switch (frame.type) {

    case PingType:
        if (frame.node === myId) return;

        send(frame.node, PongType, {
            id: frame.body.id,
            buf: frame.body.buf
        });

        break;

    case PongType:
        if (frame.node === myId) {
            pings.finish(frame.body.id, null, frame.body.buf);
            return;
        }

        break;

    case MessType:
        if (frame.node === myId) {
            return;
        } else {
            console.log('%s:%s> %s', remoteAddr.address, remoteAddr.port, frame.body.msg);
        }
        break;

    }
}

function onMessage(buf, rinfo) {
    bufrw.fromBufferResult(FrameRW, buf).toCallback(function parsed(err, frame) {
        if (err) {
            console.log('READ ERROR from %s:%s> %s', rinfo.address, rinfo.port, bufrw.formatError(err));
        } else {
            handleFrame(rinfo, frame);
        }
    });
}

function probeMTU(ctx) {
    ctx = ctx || {
        start: Date.now(),
        end: 0,
        trace: [],
        good: null,
        bad: null
    };

    var length = nextProbeMTULength(ctx);
    if (!length) {
        mtuProbed(ctx);
        return;
    }

    if (!probingMTU) {
        probingMTU = true;
        console.log('-- probing mtu');
    }
    var buf = new Buffer(length);
    for (var i = 0; i < length; i++) buf[i] = i % 0xff;
    pings.send(buf, pingDone);

    function pingDone(err, ping, gotBuf) {
        ping.length = length + PingOverhead;
        ping.err = err;
        ping.gotBuf = gotBuf;
        var ok = !err;
        for (var i = 0; ok && i < ping.sentBuf.length; i++) {
            ok = ping.sentBuf[i] === ping.gotBuf[i];
        }
        ping.ok = ok;
        ctx.trace.push(ping);
        if (ping.ok) {
            if (!ctx.good || ctx.good.length < ping.length) ctx.good = ping;
        } else {
            if (!ctx.bad || ctx.bad.length > ping.length) ctx.bad = ping;
        }
        process.nextTick(function deferNextProbe() {
            probeMTU(ctx);
        });
    }
}

function nextProbeMTULength(ctx) {
    if (ctx.good && ctx.bad) {
        return narrow();
    } else {
        return explore();
    }

    function explore() {
        if (ctx.good) {
            return 2 * (ctx.good.length - PingOverhead);
        } else if (!ctx.bad) {
            return 1;
        } else {
            var length = Math.floor((ctx.bad.length - PingOverhead) / 2);
            return length < 2 ? 0 : length;
        }
    }

    function narrow() {
        var a = ctx.good.length - PingOverhead;
        var b = ctx.bad.length - PingOverhead;
        var gap = b - a;
        var length = Math.floor(a / 2 + b / 2);
        if (gap < 2 || length < 2) {
            return 0;
        } else {
            return length;
        }
    }
}

function mtuProbed(ctx) {
    ctx.end = Date.now();
    probingMTU = false;
    if (!ctx.good && ctx.trace.length === 1 && ctx.bad.length <= PingOverhead + 1) {
        console.log('-- mtu probe got no ping responses');
        return;
    }

    if (ctx.good) {
        knownGoodMTU = ctx.good.length;
        console.log(
            '-- found good mtu %s in %s steps over %sms',
            knownGoodMTU, ctx.trace.length, ctx.end - ctx.start);
    } else {
        console.log('MTU probed:', ctx);
    }
}

function onStdinData(line) {
    var msg = line.replace(/^\s+|\s+$/g, '');
    send(MessType, {msg: msg});
}

function onStdinEnd() {
    socket.close();
}

function bound() {
    ready = true;
    for (var i = 0; i < addresses.length; i++) {
        socket.addMembership(addresses[i]);
    }
    var lines = process.stdin.pipe(split2());
    lines.on('data', onStdinData);
    lines.on('end', onStdinEnd);
    probeMTU();
}

function send(node, type, body) {
    if (!ready) {
        throw new Error('cannot send, not ready');
    }
    if (arguments.length === 2) {
        body = type;
        type = node;
        node = myId;
    }
    var frame = {
        node: node,
        type: type,
        body: body,
        checksum: 0
    };
    bufrw.toBufferResult(FrameRW, frame).toCallback(function wrote(err, buf) {
        if (err) {
            console.log('WRITE ERROR> %j\n%s', frame, bufrw.formatError(err, {color: true}));
        } else {
            for (var i = 0; i < addresses.length; i++) {
                socket.send(buf, 0, buf.length, port, addresses[i]);
            }
        }
    });
}
