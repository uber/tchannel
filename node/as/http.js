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

var assert = require('assert');
var bufrw = require('bufrw');
var http = require('http');
var PassThrough = require('readable-stream').PassThrough;
var extend = require('xtend');
var extendInto = require('xtend/mutable');
var errors = require('../errors.js');

var headerRW = bufrw.Repeat(bufrw.UInt16BE,
    bufrw.Series(bufrw.str2, bufrw.str2));

module.exports = TChannelHTTP;

function HTTPReqArg2(method, url, headerPairs) {
    var self = this;
    self.method = method || '';
    self.url = url || '';
    self.headerPairs = headerPairs || [];
}

HTTPReqArg2.RW = bufrw.Struct(HTTPReqArg2, {
    method: bufrw.str1,   // method~1
    url: bufrw.strn,      // url~N
    headerPairs: headerRW // numHeaders:2 (headerName~2 headerValue~2){numHeaders}
});

function HTTPResArg2(statusCode, message, headerPairs) {
    var self = this;
    self.statusCode = statusCode || 0;
    self.message = message || '';
    self.headerPairs = headerPairs || [];
}

HTTPResArg2.RW = bufrw.Struct(HTTPResArg2, {
    statusCode: bufrw.UInt16BE, // statusCode:2
    message: bufrw.strn,        // message~N
    headerPairs: headerRW       // numHeaders:2 (headerName~2 headerValue~2){numHeaders}
});

function TChannelHTTP(options) {
    if (!(this instanceof TChannelHTTP)) {
        return new TChannelHTTP(options);
    }
}

TChannelHTTP.prototype.sendRequest = function send(treq, hreq, options, callback) {
    assert(treq.streamed, 'as http must have a streamed tchannel request');

    if (typeof options === 'function') {
        callback = options;
        options = null;
    }

    var head = new HTTPReqArg2(hreq.method, hreq.url);
    // TODO: get lower level access to raw request header pairs
    var keys = Object.keys(hreq.headers);
    for (var i = 0; i < keys.length; i++) {
        head.headerPairs.push([keys[i], hreq.headers[keys[i]]]);
    }

    var arg1 = ''; // TODO: left empty for now, could compute circuit names heuristically
    var arg2res = bufrw.toBufferResult(HTTPReqArg2.RW, head);
    if (arg2res.err) {
        callback(arg2res.err, null, null);
        return;
    }
    var arg2 = arg2res.value;

    treq.headers.as = 'http';
    return treq.sendStreams(arg1, arg2, hreq, onResponse);

    function onResponse(err, treq, tres) {
        if (err) {
            callback(err, null, null);
        } else if (tres.streamed) {
            tres.arg2.onValueReady(arg2Ready);
        } else {
            arg2Ready(null, tres.arg2);
        }
        function arg2Ready(err, arg2) {
            if (err) {
                callback(err, null, null);
            } else {
                readArg2(tres, arg2);
            }
        }
    }

    function readArg2(tres, arg2) {
        // TODO: currently does the wrong thing and doesn't implement a
        // multi-map, due to assuming node-like mangling on the other side
        // to ensure singularity
        var arg2res = bufrw.fromBufferResult(HTTPResArg2.RW, arg2);
        if (arg2res.err) {
            callback(arg2res.err, null, null);
        } else if (tres.streamed) {
            callback(null, arg2res.value, tres.arg3);
        } else {
            var body = PassThrough();
            body.end(tres.arg3);
            callback(null, arg2res.value, body);
        }

    }
};

TChannelHTTP.prototype.sendResponse = function send(buildResponse, hres, callback) {
    // TODO: map http response codes onto error frames and application errors

    var head = new HTTPResArg2(hres.statusCode, hres.statusMessage);
    var keys = Object.keys(hres.headers);
    for (var i = 0; i < keys.length; i++) {
        head.headerPairs.push([keys[i], hres.headers[keys[i]]]);
    }

    var arg2res = bufrw.toBufferResult(HTTPResArg2.RW, head);
    if (arg2res.err) {
        // TODO: wrapped error
        callback(arg2res.err, null, null);
        buildResponse().sendError('UnexpectedError',
            'Couldn\'t encode as-http response arg2: ' +
            arg2res.err.message);
        return;
    }
    var arg2 = arg2res.value;

    return buildResponse({
        streamed: true,
        headers: {
            as: 'http'
        }
    }).sendStreams(arg2, hres, callback);
};

TChannelHTTP.prototype.setHandler = function register(tchannel, handler) {
    var self = this;
    tchannel.handler = new AsHTTPHandler(self, tchannel, handler);
    return tchannel.handler;
};

TChannelHTTP.prototype.forwardToTChannel = function forwardToTChannel(tchannel, hreq, hres, tchannelRequestOptions, callback) {
    var self = this;

    // TODO: no retrying due to:
    // - streamed bypasses TChannelRequest
    // - driving peer selection manually therefore
    // TODO: more http state machine integration

    var options = tchannel.requestOptions(extendInto({
        streamed: true,
        hasNoParent: true
    }, tchannelRequestOptions));
    var peer = tchannel.peers.choosePeer(null);
    if (!peer) {
        hres.writeHead(503, 'Service Unavailable: no tchannel peer');
        hres.end(); // TODO: error content
        callback(errors.NoPeerAvailable());
        return null;
    } else {
        // TODO: observable
        peer.waitForIdentified(onIdentified);
        return null;
    }

    function onIdentified(err) {
        if (err) {
            hres.writeHead(500, 'Connection failure');
            hres.end();
            return null;
        }

        options.host = peer.hostPort;
        var treq = tchannel.request(options);
        self.sendRequest(treq, hreq, forwarded);
    }

    function forwarded(err, head, body) {
        if (err) {
            // TODO: better map of error type -> http status code, see
            // tchannel/errors.classify
            // TODO: observable
            hres.writeHead(500, err.type + ' - ' + err.message);
            hres.end(); // TODO: error content
        } else {
            // TODO: observable
            // TODO: better lower level mapping of headerPairs
            var headers = {};
            for (var i = 0; i < head.headerPairs.length; i++) {
                var pair = head.headerPairs[i];
                headers[pair[0]] = pair[1];
            }
            hres.writeHead(head.statusCode, head.message, headers);
            body.pipe(hres);
        }
        callback(err);
    }
};

TChannelHTTP.prototype.forwardToHTTP = function forwardToHTTP(ingressChan, options, inreq, outres) {
    // TODO: should use lb_pool

    options = extend(options, {
        method: inreq.head.method,
        path: inreq.head.url,
        headers: {},
        keepAlive: true
    });
    for (var i = 0; i < inreq.head.headerPairs.length; i++) {
        var pair = inreq.head.headerPairs[i];
        options.headers[pair[0]] = pair[1];
    }

    var sent = false;
    // TODO: observable
    var outreq = http.request(options, onResponse);
    outreq.on('error', onError);
    // TODO: more http state machine integration
    inreq.body.pipe(outreq);

    function onResponse(inres) {
        if (!sent) {
            sent = true;
            // TODO: observable
            outres.sendResponse(inres);
        }
    }

    function onError(err) {
        if (!sent) {
            sent = true;
            // TODO: observable
            outres.sendError(err);
        }
    }
};

function AsHTTPHandler(asHTTP, channel, handler) {
    if (typeof handler === 'function') {
        handler = {handleRequest: handler}; // TODO: explicate type?
    }
    var self = this;
    self.asHTTP = asHTTP;
    self.channel = channel;
    self.handler = handler;
}

AsHTTPHandler.prototype.handleRequest = function handleRequest(req, buildResponse) {
    var self = this;
    var hreq = {};

    // TODO: real soon arg1 won't be streamable / fragmentable
    if (req.streamed) {
        req.arg1.onValueReady(onArg1);
    } else {
        onArg1(null, req.arg1);
    }

    function onArg1(err, arg1) {
        if (err) {
            sendError(err);
        } else {
            hreq.url = arg1;
            req.withArg2(onArg2);
        }
    }

    function onArg2(err, arg2) {
        if (err) {
            sendError(err);
            return;
        }

        var arg2res = bufrw.fromBufferResult(HTTPReqArg2.RW, arg2);
        if (arg2res.err) {
            sendError(arg2res.err);
            return;
        }

        hreq.head = arg2res.value;
        if (req.streamed) {
            hreq.body = req.arg3;
        } else {
            hreq.body = PassThrough();
            hreq.body.end(req.arg3);
        }

        handle();
    }

    function handle() {
        var hres = { // TODO: explicate type
            head: new HTTPResArg2(200, 'Ok'),
            sendError: sendError,
            sendResponse: sendResponse
        };
        // TODO: observable
        self.handler.handleRequest(hreq, hres);
    }

    function sendResponse(hres) {
        self.asHTTP.sendResponse(buildResponse, hres, sendError);
    }

    function sendError(err) {
        if (err) {
            // TODO: map type?
            buildResponse().sendError('UnexpectedError', err.message);
        }
    }
};
