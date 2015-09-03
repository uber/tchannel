#!/usr/bin/env node

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
var TChannel = require('tchannel');
var TChannelAsJSON = require('tchannel/as/json');

var parallel = require('collect-parallel/array');
var console = require('console');
var minimist = require('minimist');
var process = require('process');
var extend = require('xtend');
var fs = require('fs');

function main() {
    /*eslint no-process-exit: 0*/
    var argv = minimist(process.argv.slice(2));
    argv.hostfile = argv.H || argv.hostfile;

    var admin = Admin(argv);
    admin.run(onAdmin);

    function onAdmin(err, values) {
        if (err) {
            for (var i = 0; i < values.length; i++) {
                console.error('fanout failed', {
                    host: err.host,
                    err: err,
                    errorValue: values[i]
                });
            }
            return process.exit(1);
        }

        for (var j = 0; j < values.length; j++) {
            if (admin.json) {
                console.log(values[j].toJson());
            } else {
                console.log(values[j].toString());
            }
        }
        console.log('finished');
    }
}

module.exports = Admin;

function IdentityResultType(host, body) {
    if (!(this instanceof IdentityResultType)) {
        return new IdentityResultType(host, body);
    }

    var self = this;

    self.host = host;
}

function Admin(options) {
    if (!(this instanceof Admin)) {
        return new Admin(options);
    }

    var self = this;

    self.hosts = options.hosts || getHostPortsForProd(options.hostfile);

    self.argv = options;
    self.channel = new TChannel({
        trace: false
    });
}

Admin.exec = function exec(string, options, cb) {
    if (typeof options === 'function') {
        cb = options;
        options = {};
    }

    var opts = extend(options, minimist(string.split(' ')));
    var admin = Admin(opts);

    admin.run(cb);
    return admin;
};

Admin.prototype.run = function run(cb) {
    var self = this;

    var argv = self.argv;

    self.json = argv.j || argv.json;
    var endpoint = argv._[0];
    var help = argv.h || argv.help;

    if (help || !endpoint) {
        self.help();
    } else if (endpoint === 'kill-switch') {
        var killSwitch = KillSwitch({
            admin: self,
            argv: argv
        });
        killSwitch.run(cb);
    } else if (endpoint === 'rate-limiter') {
        var rateLimiter = RateLimiter({
            admin: self,
            argv: argv
        });
        rateLimiter.run(cb);
    } else {
        console.log('unknown sub system ' + endpoint);
        process.exit(0);
    }
};

Admin.prototype.help = function help() {
    /*eslint no-console: 0 */
    console.log('admin');
    console.log('    -h | --help:                                     print help message');
    console.log('    -j | --json:                                     print JSON');
    console.log('admin kill-switch');
    console.log('    query:                                           query existing kill switch tables');
    console.log('    -b | --block "cn~~serviceName":                  set a kill switch for cn and serviceName');
    console.log('    -u | --unblock "cn~~serviceName":                clear the kill switch for cn and serviceName');
    console.log('admin rate-limiter');
    console.log('    query:                                           query existing rate limiter settings');
    console.log('    enable:                                          enable rate limiter');
    console.log('    disable:                                         disable rate limiter');
    console.log('    limit S {integer} (req/second):                  set the RPS limit per service');
    console.log('    limit S default:                                 set the RPS limit per service as the default value');
    console.log('    total-limit {integer} (req/second):              set the total RPS limit per node');
    console.log('    total-limit default:                             set the total RPS limit per node as the default value');
    console.log('    admin rate-limiter exempt add {serviceName}:     set the service exempt by rate limiter');
    console.log('    admin rate-limiter exempt remove {serviceName}:  remove the service exempt by rate limiter');
    process.exit(0);
    return;
};

Admin.prototype.send =
function send(endpoint, body, query, cb) {
    var self = this;
    var sender = new TChannelAsJSON();

    parallel(self.hosts, each, done);

    function each(host, i, callback) {
        var subChannel = self.channel.makeSubChannel({
            serviceName: 'client_' + i,
            peers: [host]
        });
        self.channel.waitForIdentified({host: host}, function onIdentified(err) {
            if (err) {
                err.host = host;
                callback(err);
                return;
            }

            var req = subChannel.request({
                headers: {
                    cn: 'HyperbahnAdmin'
                },
                serviceName: 'autobahn',
                timeout: 10000
            });
            sender.send(req, endpoint, null, body, function onResult(error, res) {
                if (error) {
                    error.host = host;
                    return callback(error);
                }

                callback(null, query(host, res.body));
            });
        });
    }

    function done(err, results) {
        assert(!err);

        var failures = [];
        var successes = [];

        for (var i = 0; i < results.length; i++) {
            if (results[i].err) {
                failures.push(results[i].err);
            } else if (results[i].value && !(results[i].value instanceof IdentityResultType)) {
                successes.push(results[i].value);
            }
        }

        self.channel.close();

        if (failures.length > 0) {
            return cb(new Error('oops'), failures);
        }

        cb(null, successes.filter(Boolean));
    }
};

function getHostPortsForProd(hostFile) {
    if (fs.existsSync(hostFile)) {
        var content = fs.readFileSync(hostFile, 'utf8');
        return JSON.parse(content);
    }

    return [
        '127.0.0.1:21300',
        '127.0.0.1:21301'
    ];
}

function RateLimiter(options) {
    if (!(this instanceof RateLimiter)) {
        return new RateLimiter(options);
    }

    var self = this;
    self.argv = options.argv;
    self.admin = options.admin;
    self.hosts = options.admin.hosts;
}

RateLimiter.prototype.run = function run(cb) {
    /*eslint complexity: 0*/
    var self = this;

    var argv = self.argv;
    var option = argv._[1];
    var param1 = argv._[2];
    var param2 = argv._[3];

    if (option === 'query') {
        self.admin.send('rate_limiter_query_v1', {
            type: 'query'
        }, RateLimiterQuery, cb);
    } else if (option === 'enable') {
        self.admin.send('rate_limiter_enable_v1', {
            type: 'enable'
        }, IdentityResultType, cb);
    } else if (option === 'disable') {
        self.admin.send('rate_limiter_enable_v1', {
            type: 'disable'
        }, IdentityResultType, cb);
    } else if (option === 'limit' && typeof param1 === 'string' && param2 === 'default') {
        self.admin.send('rate_limiter_limit_v1', {
            serviceName: param1
        }, IdentityResultType, cb);
    } else if (option === 'limit' && typeof param1 === 'string' && typeof param2 === 'number') {
        self.admin.send('rate_limiter_limit_v1', {
            serviceName: param1,
            limit: param2
        }, IdentityResultType, cb);
    } else if (option === 'total-limit' && typeof param1 === 'number') {
        self.admin.send('rate_limiter_total_limit_v1', {
            limit: param1
        }, IdentityResultType, cb);
    } else if (option === 'total-limit' && param1 === 'default') {
        self.admin.send('rate_limiter_total_limit_v1', null, IdentityResultType, cb);
    } else if (option === 'exempt' && (param1 === 'add' || param1 === 'remove') && typeof param2 === 'string') {
        self.admin.send('rate_limiter_exempt_v1', {
            type: param1,
            exemptService: param2
        }, IdentityResultType, cb);
    } else {
        self.admin.help();
    }
};

function RateLimiterQuery(host, body) {
    if (!(this instanceof RateLimiterQuery)) {
        return new RateLimiterQuery(host, body);
    }

    var self = this;

    self.host = host;
    self.settings = body;
}

RateLimiterQuery.prototype.toString = function toString() {
    var self = this;

    var res = self.host + '\n';
    if (!self.settings) {
        res += '    empty';
        return res;
    }

    res += '    enabled: ' + self.settings.enabled + '\n' +
        '    total RPS limit: ' + self.settings.totalRpsLimit + '\n' +
        '    total RPS: ' + self.settings.totalRequestCounter.rps + '\n' +
        '    exempt services: \n';
    for (var i = 0; i < self.settings.exemptServices.length; i++) {
        res += '        ' + self.settings.exemptServices[i] + '\n';
    }

    res += '    RPS limit for services: \n';
    var keys = Object.keys(self.settings.rpsLimitForServiceName);
    if (!keys.length) {
        res += '        empty';
    }
    for (i = 0; i < keys.length; i++) {
        var key = keys[i];
        res += '        ' + key + ': ' + self.settings.rpsLimitForServiceName[key] + '\n';
    }

    res += '    RPS for services: \n';
    keys = Object.keys(self.settings.serviceCounters);
    if (!keys.length) {
        res += '        empty';
    }
    for (i = 0; i < keys.length; i++) {
        key = keys[i];
        res += '        ' + key + ': ' + self.settings.serviceCounters[key].rps + '\n';
    }

    return res;
};

RateLimiterQuery.prototype.toJson = function toJson() {
    var self = this;

    var keys = Object.keys(self.settings.serviceCounters);
    var rpsForServices = {};
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        rpsForServices[key] = self.settings.serviceCounters[key].rps;
    }

    var object = {
        host: self.host,
        enabled: self.settings.enabled,
        exemptServices: self.settings.exemptServices,
        totalRps: self.settings.totalRequestCounter.rps,
        totalRpsLimit: self.settings.totalRpsLimit,
        rpsForServices: rpsForServices,
        rpsLimitForServices: self.settings.rpsLimitForServiceName
    };

    return JSON.stringify(object);
};

function KillSwitch(options) {
    if (!(this instanceof KillSwitch)) {
        return new KillSwitch(options);
    }

    var self = this;
    self.argv = options.argv;
    self.admin = options.admin;
    self.hosts = options.admin.hosts;
    self.endpoint = 'kill_switch_v1';
}

KillSwitch.prototype.block = function block(cn, serviceName, cb) {
    var self = this;
    var body = {
        type: 'block',
        cn: cn,
        serviceName: serviceName
    };
    self.admin.send(self.endpoint, body, IdentityResultType, cb);
};

KillSwitch.prototype.unblock = function unblock(cn, serviceName, cb) {
    var self = this;
    var body = {
        type: 'unblock',
        cn: cn,
        serviceName: serviceName
    };
    self.admin.send(self.endpoint, body, IdentityResultType, cb);
};

KillSwitch.prototype.query = function query(cb) {
    var self = this;
    var body = {
        type: 'query',
        cn: null,
        serviceName: null
    };
    self.admin.send(self.endpoint, body, KillSwitchQuery, cb);
};

KillSwitch.prototype.run = function run(cb) {
    var self = this;

    var argv = self.argv;
    var block = argv.b || argv.block;
    var unblock = argv.u || argv.unblock;

    if (argv._[1] === 'query') {
        self.query(cb);
    } else if (unblock) {
        var unblocks = unblock.split('~~');
        assert(unblocks.length === 2, 'both cn and serviceName should be provided');
        self.unblock(unblocks[0], unblocks[1], cb);
    } else if (block) {
        var blocks = block.split('~~');
        assert(blocks.length === 2, 'both cn and serviceName should be provided');
        self.block(blocks[0], blocks[1], cb);
    } else {
        self.admin.help();
    }
};

function KillSwitchQuery(host, body) {
    if (!(this instanceof KillSwitchQuery)) {
        return new KillSwitchQuery(host, body);
    }

    var self = this;

    self.host = host;
    self.blockingTable = body.blockingTable;
}

KillSwitchQuery.prototype.toString = function toString() {
    var self = this;

    var res = self.host + '\n';
    if (!self.blockingTable) {
        res += '    empty';
        return res;
    }

    var keys = Object.keys(self.blockingTable);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        res += '    ' + key.replace('~~', ' ==> ') + '\n';
    }

    return res;
};

KillSwitchQuery.prototype.toJson = function toJson() {
    var self = this;

    var object = {
        host: self.host
    };

    self.blockingTable = self.blockingTable || {};
    var keys = Object.keys(self.blockingTable);
    for (var i = 0; i < keys.length; i++) {
        var services = keys[i].split('~~');
        if (!object[services[0]]) {
            object[services[0]] = [];
        }
        object[services[0]].push(services[1]);
    }

    return JSON.stringify(object);
};

if (require.main === module) {
    main();
}
