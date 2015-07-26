'use strict';

var os = require('os');
var Logger = require('logtron');
var process = require('process');

var Levels = {
    TRACE: 10,
    DEBUG: 20,
    INFO: 30,
    ACCESS: 35,
    WARN: 40,
    ERROR: 50,
    FATAL: 60
};

module.exports = createLogger;

// inline createLogger for now because yolo
function createLogger(options) {
    return Logger({
        meta: {
            team: options.team,
            project: options.project,
            hostname: os.hostname(),
            pid: process.pid
        },
        levels: {
            trace: {
                backends: [],
                level: Levels.TRACE
            },
            debug: {
                backends: ['disk', 'file', 'console'],
                level: Levels.DEBUG
            },
            info: {
                backends: ['disk', 'file', 'kafka', 'console'],
                level: Levels.INFO
            },
            access: {
                backends: ['access'],
                level: Levels.ACCESS
            },
            warn: {
                backends: ['disk', 'file', 'kafka', 'console'],
                level: Levels.WARN
            },
            error: {
                backends: ['disk', 'file', 'kafka', 'console', 'sentry'],
                level: Levels.ERROR
            },
            fatal: {
                backends: ['disk', 'file', 'kafka', 'console', 'sentry'],
                level: Levels.FATAL
            }
        },
        statsd: options.statsd,
        backends: Logger.defaultBackends({
            kafka: options.kafka,
            logFile: options.logFile,
            console: options.console,
            sentry: options.sentry,
            raw: true,
            json: true
        }, {
            statsd: options.statsd
        }),
        transforms: []
    });
}
