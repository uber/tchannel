// Copyright (c) 2015 Uber Technologies, Inc.

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

var parseArgs = require('minimist');
var argv = parseArgs(process.argv.slice(2), {
    alias: {
        m: multiplicity,
        c: numClients,
        r: numRequests
    }
});
var multiplicity = parseInt(argv.multiplicity, 10) || 2;
var numClients = parseInt(argv.numClients, 10) || 5;
var numRequests = parseInt(argv.numRequests, 10) || 20000;

var TChannel = require("../index"),
    metrics = require("metrics"),
    tests = [],
    client_options = {
        return_buffers: false
    },
    small_str, large_str, small_buf, large_buf;

function Test(args) {
    this.args = args;

    this.arg1 = new Buffer(args.command);
    this.arg2 = args.args ? new Buffer(args.args) : null;
    this.arg3 = null;
    
    this.callback = null;
    this.clients = [];
    this.clients_ready = 0;
    this.commands_sent = 0;
    this.commands_completed = 0;
    this.max_pipeline = this.args.pipeline || numRequests;
    this.client_options = args.client_options || client_options;
    
    this.connect_latency = new metrics.Histogram();
    this.ready_latency = new metrics.Histogram();
    this.command_latency = new metrics.Histogram();
}

Test.prototype.copy = function () {
    return new Test(this.args);
};

Test.prototype.run = function (callback) {
    var i;

    this.callback = callback;

    for (i = 0; i < numClients ; i++) {
        this.new_client(i);
    }
};

Test.prototype.new_client = function (id) {
    var self = this, new_client;
    
    var port = 4041 + id;
    new_client = new TChannel();
    new_client.create_time = Date.now();
    new_client.listen(port, "127.0.0.1", function (err) {
        // sending a ping to pre-connect the socket
        new_client
            .request({host: '127.0.0.1:4040'}, noop)
            .send('ping', null, null);

        new_client.on("identified", function (peer) {
            self.connect_latency.update(Date.now() - new_client.create_time);
            self.ready_latency.update(Date.now() - new_client.create_time);
            self.clients_ready++;
            if (self.clients_ready === self.clients.length) {
                self.on_clients_ready();
            }
        });

        self.clients[id] = new_client;
    });
};

Test.prototype.on_clients_ready = function () {
    this.test_start = Date.now();
    this.fill_pipeline();
};

Test.prototype.fill_pipeline = function () {
    var pipeline = this.commands_sent - this.commands_completed;

    while (this.commands_sent < numRequests && pipeline < this.max_pipeline) {
        this.commands_sent++;
        pipeline++;
        this.send_next();
    }
    
    if (this.commands_completed === numRequests) {
        this.print_stats();
        this.stop_clients();
    }
};

Test.prototype.stop_clients = function () {
    var self = this;
    
    this.clients.forEach(function (client, pos) {
        if (pos === self.clients.length - 1) {
            client.quit(function (err, res) {
                self.callback();
            });
        } else {
            client.quit();
        }
    });
};

Test.prototype.send_next = function () {
    var self = this,
        cur_client = this.commands_sent % this.clients.length,
        start = Date.now();

    this.clients[cur_client]
        .request({
            host: '127.0.0.1:4040',
            timeout: 10000,
            service: 'benchmark',
            headers: {
                benchHeader1: 'bench value one',
                benchHeader2: 'bench value two',
                benchHeader3: 'bench value three'
            }
        }, done)
        .send(this.arg1, this.arg2, this.arg3);

    function done(err, res1, res2) {
        if (err) {
            throw err;
        }
        self.commands_completed++;
        self.command_latency.update(Date.now() - start);
        self.fill_pipeline();
    }
};

Test.prototype.get_stats = function () {
    var obj = this.command_latency.printObj();
    obj.descr = this.args.descr;
    obj.pipeline = this.args.pipeline;
    obj.numClients = this.clients_ready;
    obj.elapsed = Date.now() - this.test_start;
    obj.rate = numRequests / (obj.elapsed / 1000);
    return obj;
};

Test.prototype.print_stats = function () {
    var obj = this.get_stats();
    process.stdout.write(JSON.stringify(obj) + "\n");
};

small_str = "1234";
small_buf = new Buffer(small_str);
large_str = (new Array(4097).join("-"));
large_buf = new Buffer(large_str);
var small_str_set = JSON.stringify(['foo_rand000000000000', small_str]);
var small_buf_set = new Buffer(small_str_set);
var large_str_set = JSON.stringify(['foo_rand000000000001', large_str]);
var large_buf_set = new Buffer(large_str_set);

tests.push(new Test({descr: "PING", command: "ping", args: null, pipeline: 1}));
tests.push(new Test({descr: "PING", command: "ping", args: null, pipeline: 50}));
tests.push(new Test({descr: "PING", command: "ping", args: null, pipeline: 200}));
tests.push(new Test({descr: "PING", command: "ping", args: null, pipeline: 20000}));

tests.push(new Test({descr: "SET small str", command: "set", args: small_str_set, pipeline: 1}));
tests.push(new Test({descr: "SET small str", command: "set", args: small_str_set, pipeline: 50}));
tests.push(new Test({descr: "SET small str", command: "set", args: small_str_set, pipeline: 200}));
tests.push(new Test({descr: "SET small str", command: "set", args: small_str_set, pipeline: 20000}));

tests.push(new Test({descr: "SET small buf", command: "set", args: small_buf_set, pipeline: 1}));
tests.push(new Test({descr: "SET small buf", command: "set", args: small_buf_set, pipeline: 50}));
tests.push(new Test({descr: "SET small buf", command: "set", args: small_buf_set, pipeline: 200}));
tests.push(new Test({descr: "SET small buf", command: "set", args: small_buf_set, pipeline: 20000}));

tests.push(new Test({descr: "GET small str", command: "get", args: "foo_rand000000000000", pipeline: 1}));
tests.push(new Test({descr: "GET small str", command: "get", args: "foo_rand000000000000", pipeline: 50}));
tests.push(new Test({descr: "GET small str", command: "get", args: "foo_rand000000000000", pipeline: 200}));
tests.push(new Test({descr: "GET small str", command: "get", args: "foo_rand000000000000", pipeline: 20000}));

tests.push(new Test({descr: "SET large str", command: "set", args: large_str_set, pipeline: 1}));
tests.push(new Test({descr: "SET large str", command: "set", args: large_str_set, pipeline: 50}));
tests.push(new Test({descr: "SET large str", command: "set", args: large_str_set, pipeline: 200}));
tests.push(new Test({descr: "SET large str", command: "set", args: large_str_set, pipeline: 20000}));

tests.push(new Test({descr: "SET large buf", command: "set", args: large_buf_set, pipeline: 1}));
tests.push(new Test({descr: "SET large buf", command: "set", args: large_buf_set, pipeline: 50}));
tests.push(new Test({descr: "SET large buf", command: "set", args: large_buf_set, pipeline: 200}));
tests.push(new Test({descr: "SET large buf", command: "set", args: large_buf_set, pipeline: 20000}));

tests.push(new Test({descr: "GET large str", command: "get", args: 'foo_rand000000000001', pipeline: 1}));
tests.push(new Test({descr: "GET large str", command: "get", args: 'foo_rand000000000001', pipeline: 50}));
tests.push(new Test({descr: "GET large str", command: "get", args: 'foo_rand000000000001', pipeline: 200}));
tests.push(new Test({descr: "GET large str", command: "get", args: 'foo_rand000000000001', pipeline: 20000}));

function next(i, j, done) {
    if (i >= tests.length) return done();
    if (j >= multiplicity) return next(i+1, 0, done);
    var test = tests[i].copy();
    test.run(function () {
        next(i, j+1, done);
    });
}

next(0, 0, function() {
    process.exit(0);
});

function noop() {
}
