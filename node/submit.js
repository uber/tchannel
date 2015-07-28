var TChannel = require('./');
var TCollectorTraceReporter = require('./tcollector/reporter.js');
var HyperbahnClient = require('./hyperbahn/');
var async = require('async');
var extend = require('xtend');

var SERVICE = 'submitjs';

function g() {
    return Math.floor(Math.random() * 255);
}

function genId() {
    return new Buffer([g(), g(), g(), g(), g(), g(), g(), g()]);
}

function zeroId() {
    return new Buffer([0, 0, 0, 0, 0, 0, 0, 0]);
}

var rootChannel = TChannel();
rootChannel.listen(0, '127.0.0.1');

var logger = {
    info: console.log,
    warn: console.log,
    error: console.error
};

var hyperbahnClient = HyperbahnClient({
    tchannel: rootChannel,
    serviceName: SERVICE,
    hostPortList: ['127.0.0.1:21300', '127.0.0.1:21301'],
    hardFail: true
});

rootChannel.on('listening', function () {
    console.log('listening');
    hyperbahnClient.advertise();
    hyperbahnClient.once('advertised', function adv() {
        console.log('advertised');
        var channel = hyperbahnClient.getClientChannel({
            serviceName: 'tcollector',
            trace: false
        });
        main(channel);
    });
});

function tsGen() {
    var t = Date.now();
    return function next() {
        t += 10 + Math.floor(Math.random() * 150);
        return t;
    }
}

function tcall(_ctx, service, endpoint, callback) {

    var ctx = extend({}, _ctx, {
        spanId: genId(),
        parentId: _ctx.spanId
    });

    var host = mkHost(service);

    var t0 = ctx.t();
    var t1 = ctx.t();
    var t2 = ctx.t();
    var t3 = ctx.t();

    // client reporting
    ctx.reporter.report({
        traceid: ctx.traceId,
        name: endpoint,
        id: ctx.spanId,
        parentid: ctx.parentId,
        annotations: [
            {host: host, value: 'cs', timestamp: t0},
            {host: host, value: 'cr', timestamp: t3}
        ],
        binaryAnnotations: []
    });

    // server reporting
    ctx.reporter.report({
        traceid: ctx.traceId,
        name: endpoint,
        id: ctx.spanId,
        parentid: ctx.parentId,
        annotations: [
            {host: host, value: 'sr', timestamp: t1},
            {host: host, value: 'ss', timestamp: t2}
        ],
        binaryAnnotations: []
    });
}

function mkHost(service, port) {
    return {
        ipv4: '127.0.0.1',
        port: 8000 + Math.floor(Math.random() * 1000),
        serviceName: service
    };
}

function main(channel) {
    var traceId = genId();
    var spanId = genId();

    var reporter = new TCollectorTraceReporter({
        channel: channel,
        logger: logger,
        callerName: SERVICE
    });

    var ctx = {
        t: tsGen(),
        reporter: reporter,
        traceId: traceId,
        spanId: spanId
    };

    var t0 = ctx.t();
    var host = mkHost('submitjs');

    tcall(ctx, 'calc', '/add');

    reporter.report({
        traceid: traceId,
        name: '/endpoint',
        id: spanId,
        parentid: zeroId(),
        annotations: [
            {host: host, value: 'sr', timestamp: t0},
            {host: host, value: 'ss', timestamp: ctx.t()}
        ],
        binaryAnnotations: []
    });
}

