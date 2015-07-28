var TChannel = require('./');
var TCollectorTraceReporter = require('./tcollector/reporter.js');
var HyperbahnClient = require('./hyperbahn/');
var async = require('async');

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

function tcall(t, reporter, traceId, parentId, service, endpoint, port) {
    if (!parentId) parentId = zeroId();
    var spanId = genId();

    var host = {
        ipv4: '127.0.0.1',
        port: port,
        serviceName: service
    };

    var t0 = t();
    var t1 = t();
    var t2 = t();
    var t3 = t();

    // client reporting
    reporter.report({
        traceid: traceId,
        name: endpoint,
        id: spanId,
        parentid: parentId,
        annotations: [
            {host: host, value: 'cs', timestamp: t0},
            {host: host, value: 'cr', timestamp: t3}
        ],
        binaryAnnotations: []
    });

    // server reporting
    reporter.report({
        traceid: traceId,
        name: endpoint,
        id: spanId,
        parentid: parentId,
        annotations: [
            {host: host, value: 'sr', timestamp: t1},
            {host: host, value: 'ss', timestamp: t2}
        ],
        binaryAnnotations: []
    });
}

function main(channel) {
    var traceId = genId();
    var spanId = genId();

    var reporter = new TCollectorTraceReporter({
        channel: channel,
        logger: logger,
        callerName: SERVICE
    });

    var submitjs = {
        ipv4: '127.0.0.1',
        port: 6667,
        serviceName: SERVICE
    };

    var t = tsGen();
    var t0 = t();

    reporter.report({
        traceid: traceId,
        name: '/endpoint',
        id: spanId,
        parentid: zeroId(),
        annotations: [
            {host: submitjs, value: 'sr', timestamp: t0},
            {host: submitjs, value: 'ss', timestamp: t0 + 1000}
        ],
        binaryAnnotations: []
    });

    tcall(t, reporter, traceId, spanId, 'calc', '/add', 65521);
}

