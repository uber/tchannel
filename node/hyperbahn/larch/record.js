'use strict';

var os = require('os');
var process = require('process');
var extend = require('xtend');

module.exports = Record;

function Record(level, msg, meta, time) {
    this.meta = (meta === null || meta === void 0) ? null : meta;
    this.data = new RecordData(level, msg, meta, time);
    this.serialized = null;
    this.hasBeenMerged = false;
}

Record.prototype.serialize = function serialize () {
    if (!this.serialized) {
        this.serialized = JSON.stringify(this);
    }

    return this.serialized;
};

Record.prototype.toJSON = function toJSON () {
    var i;
    if (!this.hasBeenMerged) {
        for (i in this.meta) {
            this.data[i] = this.meta[i];
        }

        this.hasBeenMerged = true;
    }

    return this.data;
};

function RecordData(level, msg, meta, time) {
    this.level = level;
    this.msg = msg;
    this.time = time || new Date().toISOString();
    this.component = null;
    this.src = 0;
    this.v = 0;
    this.pid = process.pid;
    this.hostname = os.hostname();
    this.name = null;
}
