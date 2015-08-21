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
var fs = require('fs');
var path = require('path');
var RemoteConfig = require('../../clients/remote-config.js');
var DebugLogtron = require('debug-logtron');

module.exports = RemoteConfigFile;

function RemoteConfigFile(name) {
    if (!(this instanceof RemoteConfigFile)) {
        return new RemoteConfigFile(name);
    }

    var self = this;
    name = name || '';
    self.filePath = path.join('/tmp', name + 'config.json');
}

RemoteConfigFile.prototype.write = function write(opts) {
    var self = this;
    var obj = [];
    opts = opts || {};
    var keys = Object.keys(opts);
    for (var i = 0; i < keys.length; i++) {
        obj.push({
            key: keys[i],
            value: opts[keys[i]]
        });
    }

    self.writeFile(JSON.stringify(obj || {}));
};

RemoteConfigFile.prototype.writeFile = function writeFile(content) {
    var self = this;
    fs.writeFileSync(
        self.filePath,
        content,
        'utf8'
    );
};

RemoteConfigFile.prototype.create = function create(opts) {
    var self = this;
    var logger = DebugLogtron('remoteconfig');
    opts = opts || {};

    logger.whitelist('error', '[remote-config] could not read file');

    return RemoteConfig({
        configFile: self.filePath,
        pollInterval: opts.pollInterval,
        logger: logger
    });
};

RemoteConfigFile.prototype.clear = function clear() {
    var self = this;
    if (fs.existsSync(self.filePath)) {
        fs.unlinkSync(self.filePath);
    }
};
