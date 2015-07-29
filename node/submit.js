var TChannel = require('./');
var TCollectorTraceReporter = require('./tcollector/reporter.js');
var HyperbahnClient = require('./hyperbahn/');
var async = require('async');
var extend = require('xtend');

var SERVICE = 'submitjs';

function randInt(n) {
    return Math.floor(Math.random() * n)
}

function g() {
    return randInt(255);
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

function tsGen(t) {
    if (!t) t = Date.now();
    return function next(offset) {
        if (offset === undefined) {
            t += 10 + Math.floor(Math.random() * 150);
        } else {
            t += offset;
        }
        return t;
    }
}

function branch(_ctx) {
    return extend({}, _ctx, {
        t: tsGen(_ctx.t(0))
    });
}


function tcall(_ctx, service, endpoint, callback) {
    //TODO: need to thread host through the ctx

    var ctx = extend({}, _ctx, {
        spanId: genId(),
        parentId: _ctx.spanId,
        host: mkHost(service)
    });

    console.log(_ctx.host, ctx.host);

    var t0 = ctx.t();
    var t1 = ctx.t();

    if (callback) {
        callback(ctx);
    }

    var t2 = ctx.t();
    var t3 = ctx.t();

    // client reporting
    ctx.reporter.report({
        traceid: ctx.traceId,
        name: endpoint,
        id: ctx.spanId,
        parentid: ctx.parentId,
        annotations: [
            {host: _ctx.host, value: 'cs', timestamp: t0},
            {host: _ctx.host, value: 'cr', timestamp: t3}
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
            {host: ctx.host, value: 'sr', timestamp: t1},
            {host: ctx.host, value: 'ss', timestamp: t2}
        ],
        binaryAnnotations: []
    });
}

function randIP() {
    return [10, randInt(255), randInt(255), randInt(255)].join(".");
}

function mkHost(service) {
    return {
        ipv4: randIP(),
        port: 8000 + randInt(1000),
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
        spanId: spanId,
        host: mkHost('submitjs')
    };

    var t0 = ctx.t();

    tcall(ctx, 'calc', '/add', function (ctx) {
        var ctx2 = branch(ctx);

        tcall(ctx, 'math', '/getarg0');
        tcall(ctx, 'math', '/getarg1');
        tcall(ctx, 'math', '/getarg2');
        tcall(ctx, 'math', '/getarg3');
        tcall(ctx, 'math', '/getarg4');
        tcall(ctx, 'math', '/getarg5', function (ctx) {
            tcall(ctx, 'argument', '/extract0');
            tcall(ctx, 'argument', '/extract1');
            tcall(ctx, 'argument', '/extract2');
            tcall(ctx, 'argument', '/extract3');
        });
        tcall(ctx, 'math', '/getarg6');
        tcall(ctx, 'math', '/getarg7');

        // branch
        tcall(ctx2, 'ncar', '/find', function (ctx) {
            tcall(ctx, 'math', '/newstuff0');
            tcall(ctx, 'math', '/newstuff1');
            tcall(ctx, 'math', '/newstuff2');
            tcall(ctx, 'math', '/newstuff3');
            tcall(ctx, 'math', '/newstuff4');
        });
    });

    reporter.report({
        traceid: traceId,
        name: '/endpoint',
        id: spanId,
        parentid: zeroId(),
        annotations: [
            {host: ctx.host, value: 'sr', timestamp: t0},
            {host: ctx.host, value: 'ss', timestamp: ctx.t()}
        ],
        binaryAnnotations: []
    });
}

