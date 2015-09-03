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

var bufrw = require('bufrw');
var http = require('http');
var extend = require('xtend');
var extendInto = require('xtend/mutable');
var errors = require('../errors.js');
var getRawBody = require('raw-body');

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
    var self = this;
    if (options) {
        self.lbpool = options.lbpool;
    }
}

TChannelHTTP.prototype.sendRequest = function send(treq, hreq, options, callback) {
    var self = this;
    if (typeof options === 'function') {
        callback = options;
        options = null;
    }

    var head = new HTTPReqArg2(hreq.method, hreq.url);
    head.headerPairs = self._toBufferHeader(hreq.headers);

    var arg1 = ''; // TODO: left empty for now, could compute circuit names heuristically
    var arg2res = bufrw.toBufferResult(HTTPReqArg2.RW, head);
    if (arg2res.err) {
        self.logger.error('Buffer write for arg2 failed', {
            error: arg2res.err
        });
        var toBufferErr = errors.HTTPReqArg2toBufferError(arg2res.err, {
            head: head
        });
        callback(toBufferErr, null, null);
        return null;
    }
    var arg2 = arg2res.value;

    treq.headers.as = 'http';
    if (treq.streamed) {
        return treq.sendStreams(arg1, arg2, hreq, onStreamResponse);
    }
    getRawBody(hreq, {
        length: hreq.headers['content-length'],
        limit: '1mb'
    }, onRawBody);

    function onRawBody(err, body) {
        if (err) {
            callback(err, null, null, null);
            return err;
        }
        return treq.send(arg1, arg2, body, onResponse);
    }

    function onResponse(err, tres, arg2, arg3) {
        if (err) {
            callback(err, null, null, null);
        } else {
            readArg2(tres, arg2);
        }
    }

    function onStreamResponse(err, treq, tres) {
        if (err) {
            callback(err, null, null, null);
        } else if (tres.streamed) {
            tres.arg2.onValueReady(arg2Ready);
        } else {
            arg2Ready(null, tres.arg2);
        }
        function arg2Ready(err, arg2) {
            if (err) {
                callback(err, null, null, null);
            } else {
                readArg2(tres, arg2);
            }
        }
    }

    function readArg2(tres, arg2) {
        var arg2res = bufrw.fromBufferResult(HTTPResArg2.RW, arg2);
        if (arg2res.err) {
            self.logger.error('Buffer read for arg2 failed', {
                error: arg2res.err
            });
            var fromBufferErr = errors.HTTPReqArg2fromoBufferError(arg2res.err, {
                arg2: arg2
            });
            callback(fromBufferErr, null, null, null);
        } else if (tres.streamed) {
            callback(null, arg2res.value, tres.arg3, null);
        } else {
            callback(null, arg2res.value, null, tres.arg3);
        }
    }
};

TChannelHTTP.prototype.sendResponse = function send(buildResponse, hres, body, callback) {
    // TODO: map http response codes onto error frames and application errors
    var self = this;
    var head = new HTTPResArg2(hres.statusCode, hres.statusMessage);
    head.headerPairs = self._toBufferHeader(hres.headers);
    var arg2res = bufrw.toBufferResult(HTTPResArg2.RW, head);
    if (arg2res.err) {
        self.logger.error('Buffer write for arg2 failed', {
            error: arg2res.err
        });
        var toBufferErr = errors.HTTPResArg2toBufferError(arg2res.err, {
            head: head
        });
        callback(toBufferErr);
        return null;
    }
    var arg2 = arg2res.value;
    if (body) {
        buildResponse({
            streamed: false,
            headers: {
                as: 'http'
            }
        }).sendOk(arg2, body);
        callback(null);
        return null;
    }

    return buildResponse({
        streamed: true,
        headers: {
            as: 'http'
        }
    }).sendStreams(arg2, hres, callback);
};

TChannelHTTP.prototype.setHandler = function register(tchannel, handler) {
    var self = this;
    self.logger = tchannel.logger;
    tchannel.handler = new AsHTTPHandler(self, tchannel, handler);
    return tchannel.handler;
};

TChannelHTTP.prototype.forwardToTChannel = function forwardToTChannel(tchannel, hreq, hres, requestOptions, callback) {
    var self = this;
    self.logger = self.logger || tchannel.logger;
    // TODO: more http state machine integration

    var options = tchannel.requestOptions(extendInto({
        hasNoParent: true
    }, requestOptions));

    if (!options.streamed) {
        var treq = tchannel.request(options);
        return self.sendRequest(treq, hreq, forwarded);
    }

    var peer = tchannel.peers.choosePeer(null);
    if (!peer) {
        self._sendHTTPError(hres, errors.NoPeerAvailable());
        callback(errors.NoPeerAvailable());
        return null;
    }

    peer.waitForIdentified(onIdentified);
    function onIdentified(err) {
        if (err) {
            self._sendHTTPError(hres, err);
            callback(err);
            return null;
        }

        options.host = peer.hostPort;
        var treq = tchannel.request(options);
        self.sendRequest(treq, hreq, forwarded);
    }

    function forwarded(err, head, bodyStream, bodyArg) {
        if (err) {
            self._sendHTTPError(hres, err);
        } else {
            var headers = self._fromBufferHeader(head.headerPairs);
            // work-arround a node issue where default statusMessage is missing
            // from the client side when server side set as optional parameter
            if (head.message) {
                hres.writeHead(head.statusCode, head.message, headers);
            } else {
                hres.writeHead(head.statusCode, headers);
            }
            if (bodyStream !== null) {
                bodyStream.pipe(hres);
            } else {
                hres.end(bodyArg);
            }
        }
        callback(err);
    }
};

TChannelHTTP.prototype._sendHTTPError = function _sendHTTPError(hres, error) {
    hres.setHeader('Content-Type', 'text/plain');
    var codeName = errors.classify(error);
    switch (codeName) {
        case 'Cancelled':
            hres.writeHead(500, 'TChannel Cancelled');
            break;
        case 'Unhealthy':
        case 'Declined':
            hres.writeHead(503, 'Service Unavailable');
            break;
        case 'Timeout':
            hres.writeHead(504, 'Gateway Timeout');
            break;
        case 'BadRequest':
            hres.writeHead(400, 'Bad Request');
            break;
        case 'Busy':
            hres.writeHead(429, 'Too Many Requests');
            break;
        case 'ProtocolError':
            hres.writeHead(500, 'TChannel Protocol Error');
            break;
        case 'NetworkError':
            hres.writeHead(500, 'TChannel Network Error');
            break;
        default:
            hres.writeHead(500, 'Internal Server Error');
    }
    hres.end(error.message);
};

TChannelHTTP.prototype.forwardToHTTP = function forwardToHTTP(tchannel, options, inreq, outres, callback) {
    var self = this;
    self.logger = self.logger || tchannel.logger;
    var headers = self._fromBufferHeader(inreq.head.headerPairs);
    options = extend(options, {
        method: inreq.head.method,
        path: inreq.head.url,
        headers: headers,
        keepAlive: true
    });
    if (self.lbpool) {
        self._forwardToLBPool(options, inreq, outres, callback);
    } else {
        self._forwardToNodeHTTP(options, inreq, outres, callback);
    }
};

TChannelHTTP.prototype._forwardToLBPool = function _forwardToLBPool(options, inreq, outres, callback) {
    var self = this;
    if (!options) { options = {}; }
    options.encoding = null;
    var data = inreq.bodyStream || inreq.bodyArg; // lb_pool likes polymorphism
    self.lbpool.request(options, data, onResponse);

    function onResponse(err, res, body) {
        if (err) {
            self.logger.warn('Forwarding to LBPool failed', {
                error: err
            });
            outres.sendError(err);
            callback(err);
            return;
        }
        outres.sendResponse(res, body);
        callback(null);
    }
};

TChannelHTTP.prototype._forwardToNodeHTTP = function _forwardToNodeHTTP(options, inreq, outres, callback) {
    var self = this;
    var sent = false;
    var outreq = http.request(options, onResponse);
    outreq.on('error', onError);
    // TODO: more http state machine integration

    if (inreq.bodyStream !== null) {
        inreq.bodyStream.pipe(outreq);
    } else {
        outreq.end(inreq.bodyArg);
    }

    function onResponse(inres) {
        if (!sent) {
            sent = true;
            outres.sendResponse(inres);
            callback(null);
        }
    }

    function onError(err) {
        if (!sent) {
            sent = true;
            self.logger.warn('Forwarding to HTTP failed', {
                error: err
            });
            outres.sendError(err);
            callback(err);
        }
    }
};

// per RFC2616
TChannelHTTP.prototype._fromBufferHeader = function _fromBufferHeader(bufrwHeaders) {
    var httpHeaders = {};
    for (var i = 0; i < bufrwHeaders.length; i++) {
        var pair = bufrwHeaders[i];
        var key = pair[0];
        var val = pair[1];
        key = key.toLowerCase();
        switch (key) {
            case 'set-cookie':
                if (httpHeaders[key] !== undefined) {
                    httpHeaders[key].push(val);
                } else {
                    httpHeaders[key] = [val];
                }
                break;
            case 'content-type':
            case 'content-length':
            case 'user-agent':
            case 'referer':
            case 'host':
            case 'authorization':
            case 'proxy-authorization':
            case 'if-modified-since':
            case 'if-unmodified-since':
            case 'from':
            case 'location':
            case 'max-forwards':
                // drop duplicates
                if (httpHeaders[key] === undefined) {
                    httpHeaders[key] = val;
                }
                break;
            default:
                // make comma-separated list
                if (httpHeaders[key] !== undefined) {
                    httpHeaders[key] += ', ' + val;
                } else {
                    httpHeaders[key] = val;
                }
        }
    }
    return httpHeaders;
};

TChannelHTTP.prototype._toBufferHeader = function _toBufferHeader(httpHeaders) {
    var bufrwHeaders = [];
    var keys = Object.keys(httpHeaders);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var val = httpHeaders[key];
        switch (key) {
            case 'set-cookie':
                for (var j = 0; j < val.length; j++) {
                    bufrwHeaders.push([key, val[j]]);
                }
                break;
            case 'content-type':
            case 'content-length':
            case 'user-agent':
            case 'referer':
            case 'host':
            case 'authorization':
            case 'proxy-authorization':
            case 'if-modified-since':
            case 'if-unmodified-since':
            case 'from':
            case 'location':
            case 'max-forwards':
                // no duplicates
                bufrwHeaders.push([key, val]);
                break;
            default:
                // prase comma-separated list
                val = val.split(', ');
                for (var k = 0; k < val.length; k++) {
                    bufrwHeaders.push([key, val[k]]);
                }
        }
    }
    return bufrwHeaders;
};

function AsHTTPHandler(asHTTP, channel, handler) {
    if (typeof handler === 'function') {
        handler = {handleRequest: handler}; // TODO: explicate type?
    }
    var self = this;
    self.asHTTP = asHTTP;
    self.channel = channel;
    self.handler = handler;
    self.logger = self.channel.logger;
}

AsHTTPHandler.prototype.handleRequest = function handleRequest(req, buildResponse) {
    var self = this;

    // TODO: explicate type
    var hreq = {
        url: req.arg1,
        head: null,
        bodyArg: null,
        bodyStream: null
    };
    req.withArg2(onArg2);

    function onArg2(err, arg2) {
        if (err) {
            sendError(err);
            return;
        }

        var arg2res = bufrw.fromBufferResult(HTTPReqArg2.RW, arg2);
        if (arg2res.err) {
            self.logger.error('Buffer read for arg2 failed', {
                error: arg2res.err
            });
            var fromBufferErr = errors.HTTPResArg2fromoBufferError(arg2res.err, {
                arg2: arg2
            });
            sendError(fromBufferErr);
            return;
        }

        hreq.head = arg2res.value;
        if (req.streamed) {
            hreq.bodyStream = req.arg3;
        } else {
            hreq.bodyArg = req.arg3;
        }

        handle();
    }

    var sent = false;
    req.errorEvent.on(onError);
    function onError(err) {
        sent = true;
        self.logger.warn('Handling request failed', {
            error: err
        });
    }

    function handle() {
        // TODO: explicate type
        var hres = {
            head: new HTTPResArg2(200, 'Ok'),
            sendError: sendError,
            sendResponse: sendResponse
        };

        self.handler.handleRequest(hreq, hres);
    }

    function sendResponse(hres, body) {
        if (!sent) {
            sent = true;
            self.asHTTP.sendResponse(buildResponse, hres, body, sendError);
        }
    }

    function sendError(err) {
        if (!sent) {
            sent = true;
            self.logger.warn('Handling request failed', {
                error: err
            });
            var codeString = errors.classify(err);
            buildResponse().sendError(
                codeString ? codeString : 'UnexpectedError', err.message);
        }
    }
};
