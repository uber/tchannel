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

var validators = require('../lib/simple_validators');

var idStore = {};

module.exports = [
    {
        "name": "/foobar",
        "endpoint": {
            "ipv4": "127.0.0.1",
            "port": 9997,
            "serviceName": "subservice"
        },
        "traceid": validators.checkId(idStore, 'traceid'),
        "parentid": validators.checkId(idStore, 'span0'),
        "spanid": validators.checkId(idStore, 'span1'),
        "annotations": [
            {
                "value": "sr",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 9997,
                    "serviceName": "subservice"
                }
            },
            {
                "value": "ss",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 9997,
                    "serviceName": "subservice"
                }
            }
        ],
        "binaryAnnotations": []
    },
    {
        "name": "/foobar",
        "endpoint": {
            "ipv4": "127.0.0.1",
            "port": 9997,
            "serviceName": "subservice"
        },
        "traceid": validators.checkId(idStore, 'traceid'),
        "parentid": validators.checkId(idStore, 'span0'),
        "spanid": validators.checkId(idStore, 'span1'),
        "annotations": [
            {
                "value": "cs",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 9997,
                    "serviceName": "subservice"
                }
            },
            {
                "value": "cr",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 9997,
                    "serviceName": "subservice"
                }
            }
        ],
        "binaryAnnotations": []
    },
    {
        "name": "/top_level_endpoint",
        "endpoint": {
            "ipv4": "127.0.0.1",
            "port": 9999,
            "serviceName": "server"
        },
        "traceid": validators.checkId(idStore, 'traceid'),
        "parentid": "0000000000000000",
        "spanid": validators.checkId(idStore, 'span0'),
        "annotations": [
            {
                "value": "sr",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 9999,
                    "serviceName": "server"
                }
            },
            {
                "value": "ss",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 9999,
                    "serviceName": "server"
                }
            }
        ],
        "binaryAnnotations": []
    }
];

