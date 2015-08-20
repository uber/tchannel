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
