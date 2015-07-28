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

    var calc = {
        ipv4: '127.0.0.1',
        port: 6668,
        serviceName: 'calc'
    };

    var t = tsGen();
    t0 = t();
    t1 = t();
    t2 = t();
    t3 = t();
    t4 = t();
    t5 = t();

    reporter.report({
        traceid: traceId,
        name: '/endpoint',
        id: spanId,
        parentid: zeroId(),
        annotations: [
            {host: submitjs, value: 'sr', timestamp: t0},
            {host: submitjs, value: 'ss', timestamp: t5}
        ],
        binaryAnnotations: []
    });

    reporter.report({
        traceid: traceId,
        name: '/add',
        id: genId(),
        parentid: spanId,
        annotations: [
            {host: calc, value: 'sr', timestamp: t1},
            {host: calc, value: 'ss', timestamp: t2}
        ],
        binaryAnnotations: []
    });
}

