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

function main() {
    var tchan = require('../channel');
    var replrClient = require('replr/bin/replr');
    var TermClient = require('./term_client');

    var chan = tchan();
    var client = TermClient(chan, {
        request: {
            host: '127.0.0.1:4040',
            timeout: 1000,
        }
    });
    client.on('error', onError);
    client.on('started', start);
    client.on('finished', finish);
    client.start();

    function onError(err) {
        console.error(err);
        finish();
    }

    function start() {
        client.linkSize(process.stdout);
        replrClient.attachStdinStdoutToReplStream(client.stream);
    }

    function finish() {
        process.stdin.setRawMode(false);
        chan.quit();
    }
}

if (require.main === module) {
    main();
}
