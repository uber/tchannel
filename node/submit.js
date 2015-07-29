var TChannel = require('./');
var TCollectorTraceReporter = require('./tcollector/reporter.js');
var HyperbahnClient = require('./hyperbahn/');
var async = require('async');
var extend = require('xtend');
var Span = require('./trace/span');

var SERVICE = 'submitjs';

// rewrite using span.js
// integrate with POC on ON

function randInt(n) {
    return Math.floor(Math.random() * n)
}

function g() {
    return randInt(255);
}

function genId() {
    return new Buffer([g(), g(), g(), g(), g(), g(), g(), g()]);
}

var zeroId = Buffer([0, 0, 0, 0, 0, 0, 0, 0]);

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
    hyperbahnClient.advertise();
    hyperbahnClient.once('advertised', function adv() {
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


function bcall(/* args */) {
    var args = Array.prototype.slice.call(arguments, 0);
    args[0] = branch(args[0]);
    tcall.apply(null, args);
}


function tcall(_ctx, service, endpoint, callback) {
    //TODO: need to thread host through the ctx

    var ctx = extend({}, _ctx, {
        spanId: genId(),
        parentId: _ctx.spanId,
        host: mkHost(service),
        topLevel: false
    });

    var t0 = ctx.t();
    var t1 = ctx.t();

    if (callback) {
        callback(ctx);
    }

    var t2 = ctx.t();
    var t3 = ctx.t();

    // client reporting
    if (!_ctx.topLevel) {
        var src = _ctx.host.ipv4 + ":" + _ctx.host.port;

        var span = new Span({
            endpoint: new Span.Endpoint(ctx.host.ipv4, ctx.host.port, ctx.host.serviceName),
            traceid: ctx.traceId,
            name: endpoint,
            id: ctx.spanId,
            parentid: ctx.parentId
        });
        span.annotate('cs', t0);
        span.annotate('cr', t3);
        span.annotateBinary('cn', _ctx.host.serviceName, 'STRING');
        span.annotateBinary('as', 'thrift', 'STRING');
        span.annotateBinary('src', src, 'STRING');
        console.log(JSON.stringify(span.toJSON()));

        ctx.reporter.report(span);
    }

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

function parallel(ctx, funcs) {
    var times = funcs.map(function (f) {
        var ctx2 = branch(ctx);
        f(ctx2);
        return ctx2.t(0);
    });
    var last = Math.max.apply(Math, times);
    var delta = last - ctx.t(0);
    ctx.t(delta);
    ctx.t();
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
        parentid: zeroId,
        host: mkHost('submitjs'),
        topLevel: true
    };

    tcall(ctx, 'connection_node', '/ping', function (ctx) {
        tcall(ctx, 'dispatch', '/ping', function (ctx) {
            // branch
            tcall(ctx, 'ncar', '/find', function (ctx) {
                tcall(ctx, 'geo', '/lookup0');
                tcall(ctx, 'geo', '/lookup1');
                tcall(ctx, 'geo', '/lookup2');
                tcall(ctx, 'geo', '/lookup3');
                tcall(ctx, 'geo', '/lookup4');
            });
            parallel(ctx, [
                function (ctx) {
                    tcall(ctx, 'goldeta', '/eta', function (ctx) {
                        tcall(ctx, 'osrm', '/route');
                        tcall(ctx, 'osrm', '/route');
                        tcall(ctx, 'osrm', '/route');
                    });
                },
                function (ctx) {
                    tcall(ctx, 'goldeta', '/eta', function (ctx) {
                        tcall(ctx, 'osrm', '/route');
                        tcall(ctx, 'osrm', '/route');
                        tcall(ctx, 'osrm', '/route');
                    });
                },
                function (ctx) {
                    tcall(ctx, 'goldeta', '/eta', function (ctx) {
                        tcall(ctx, 'osrm', '/route');
                        tcall(ctx, 'osrm', '/route');
                        tcall(ctx, 'osrm', '/route');
                    });
                },
                function (ctx) {
                    tcall(ctx, 'goldeta', '/eta', function (ctx) {
                        tcall(ctx, 'osrm', '/route');
                        tcall(ctx, 'osrm', '/route');
                        tcall(ctx, 'osrm', '/route');
                    });
                }]
            );
        });
    });
}

