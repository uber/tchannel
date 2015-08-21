#!/usr/bin/env node
'use strict';

var process = require('process');
var minimist = require('minimist');
var tcurlBinary = require('tcurl');

module.exports = tcurlBinary;

if (require.main === module) {
    var args = minimist(process.argv.slice(2));
    tcurlBinary(args);
}
