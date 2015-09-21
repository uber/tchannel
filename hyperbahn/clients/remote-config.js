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

var setTimeout = require('timers').setTimeout;
var clearTimeout = require('timers').clearTimeout;
var fs = require('fs');
var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var DEFAULT_POLL_INTERVAL = 60 * 1000;

module.exports = RemoteConfig;

function RemoteConfig(options) {
    if (!(this instanceof RemoteConfig)) {
        return new RemoteConfig(options);
    }

    var self = this;
    EventEmitter.call(self);

    assert(options && options.configFile, 'options.configFile required');
    assert(options && options.logger, 'options.logger required');

    self.logger = options.logger;
    self.logError = options.logError;
    self.pollInterval = options.pollInterval || DEFAULT_POLL_INTERVAL;

    self.configRemoteFile = new RemoteConfigFile({
        filePath: options.configFile,
        logger: options.logger,
        logError: self.logError
    });
    self._configValues = new ConfigValues({
        remoteConfig: self,
        configRemoteFile: self.configRemoteFile,
        logger: options.logger
    });

    self.pollTimer = null;
    self._destroyed = false;
    self._inLoadSync = false;
}
util.inherits(RemoteConfig, EventEmitter);

RemoteConfig.prototype.startPolling = function startPolling() {
    var self = this;

    self.pollTimer = setTimeout(function onPoll() {
        self._checkFile();
    }, self.pollInterval);
};

RemoteConfig.prototype.loadSync = function loadSync() {
    var self = this;

    self._inLoadSync = true;
    self.configRemoteFile.loadSync();
    self._inLoadSync = false;
};

RemoteConfig.prototype.get = function get(key, defaultValue) {
    var self = this;

    return self._configValues.get(key, defaultValue);
};

RemoteConfig.prototype.destroy = function destroy() {
    var self = this;

    self._destroyed = true;

    clearTimeout(self.pollTimer);
};

RemoteConfig.prototype._checkFile = function _checkFile() {
    var self = this;
    self.configRemoteFile.statFile(finish);

    function finish() {
        if (!self._destroyed) {
            self.startPolling();
        }
    }
};

/*  ConfigValues

    This class keeps on updating config files

    Supports three functions

     - get(key) lookup the key in the current configData
     - emit('update') emits a update event if there is new data
     - emit('change:{key}') emits a change event if a key changed

*/
function ConfigValues(options) {
    if (!(this instanceof ConfigValues)) {
        return new ConfigValues(options);
    }

    var self = this;

    self.logger = options.logger;
    self.configRemoteFile = options.configRemoteFile;
    self.remoteConfig = options.remoteConfig;

    self._configValues = {};
    self.configRemoteFile.on('fileChange', updateConfigValues);

    function updateConfigValues(configObject) {
        self._updateConfigValues(configObject);
    }
}

ConfigValues.prototype.get = function get(key, defaultValue) {
    var self = this;

    assert(defaultValue !== undefined, 'defaultValue is required');

    var value = self._configValues[key];
    if (value === undefined) {
        value = defaultValue;
    }

    if (typeof value !== typeof defaultValue) {
        self.logger.error('[remote-config] Mismatch of value types', {
            defaultValueType: typeof defaultValue,
            valueType: typeof value
        });

        return defaultValue;
    }

    return value;
};

ConfigValues.prototype._updateConfigValues = function _updateConfigValues(newConfig) {
    var self = this;
    var oldConfigValues = self._configValues;

    self._configValues = newConfig;
    self.remoteConfig.emit('update');

    var changedKeys = [];

    // check for values in current newConfig that are different in oldConfig
    var keys = Object.keys(newConfig);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];

        var newJSON = JSON.stringify(newConfig[key]);
        var oldJSON = JSON.stringify(oldConfigValues[key]);

        if (newJSON !== oldJSON) {
            self.remoteConfig.emit('change:' + key);
            changedKeys.push('update:' + key);
        }
    }

    // Check for old keys that do not exist in current newConfig
    var oldKeys = Object.keys(oldConfigValues);
    for (var j = 0; j < oldKeys.length; j++) {
        var oldKey = oldKeys[j];

        if (!(oldKey in newConfig)) {
            self.remoteConfig.emit('change:' + oldKey);
            changedKeys.push('remove:' + key);
        }
    }

    if (!self.remoteConfig._inLoadSync) {
        self.logger.info('[remote-config] config file changed', {
            changedKeys: changedKeys,
            newConfig: newConfig
        });
    }
};

/*  RemoteConfigFile

    This class deals with all file IO. If you want to get the
    file from a different remote location you could implement
    another RemoteConfigFile that doesnt do file IO.

    Supports three functions:

     - loadSync(), checks the file sync and emits change event
     - statFile(), checks to see if fs.Stat is different, if
        so will load async and emit change event
     - on('fileChange'), listen to file changes

*/
function RemoteConfigFile(options) {
    if (!(this instanceof RemoteConfigFile)) {
        return new RemoteConfigFile(options);
    }

    var self = this;
    EventEmitter.call(self);

    self.filePath = options.filePath;
    self.logger = options.logger;
    self.logError = options.logError;

    self._oldStat = null;
}
util.inherits(RemoteConfigFile, EventEmitter);

RemoteConfigFile.prototype.statFile = function statFile(cb) {
    var self = this;

    fs.stat(self.filePath, onStat);

    function onStat(err, stat) {
        self._onStat(err, stat, cb);
    }
};

RemoteConfigFile.prototype.loadSync = function loadSync() {
    var self = this;

    var result = safeSyncRead(self.filePath);
    self._parseFile(result.error, result.fileContents);
};

RemoteConfigFile.prototype._onStat = function _onStat(err, stat, cb) {
    var self = this;
    if (err) {
        var msg = '[remote-config] Could not stat file';
        var logObj = {
            error: err,
            filePath: self.filePath
        };
        if (self.logError) {
            self.logger.error(msg, logObj);
        }
        return cb();
    }

    var oldStat = self._oldStat;
    if (oldStat && Number(oldStat.mtime) === Number(stat.mtime) &&
        Number(oldStat.size) === Number(stat.size)) {
        return cb();
    }

    self._oldStat = stat;
    self._refreshFile();

    cb();
};

RemoteConfigFile.prototype._refreshFile = function _refreshFile() {
    var self = this;

    fs.readFile(self.filePath, 'utf8', onFile);

    function onFile(err, fileContents) {
        self._parseFile(err, fileContents);
    }
};

RemoteConfigFile.prototype._parseFile = function _parseFile(err, fileContents) {
    var self = this;

    if (err) {
        var msg = '[remote-config] could not read file';
        var logObj = {
                error: err,
                filePath: self.filePath
        };
        if (self.logError) {
            self.logger.error(msg, logObj);
        }

        return;
    }

    var result = safeJSONParse(fileContents);
    if (result.error) {
        self.logger.error('[remote-config] could not json parse file', {
            error: result.error,
            filePath: self.filePath
        });

        return;
    }

    var json = self._convert(result.json);
    self.emit('fileChange', json);
};

RemoteConfigFile.prototype._convert = function _convert(json) {
    var object = {};
    for (var i = 0; i < json.length; i++) {
        object[json[i].key] = json[i].value;
    }

    return object;
};

function safeSyncRead(filePath) {
    var fileContents;
    var error;

    try {
        fileContents = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        error = err;
    }

    return {
        fileContents: fileContents,
        error: error
    };
}

function safeJSONParse(text) {
    var json;
    var error;

    try {
        json = JSON.parse(text);
    } catch (err) {
        error = err;
    }

    return {
        json: json,
        error: error
    };
}
