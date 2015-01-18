'use strict';

var TChannel = require('../../index.js');

module.exports = allocCluster;

function allocCluster(opts) {
    opts = opts || {};
    var portOne = randomPort();
    var portTwo = randomPort();

    var one = TChannel({
        host: 'localhost',
        port: portOne,
        timers: opts.timers
    });
    var two = TChannel({
        host: 'localhost',
        port: portTwo,
        timers: opts.timers
    });

    return {
        one: one,
        two: two,
        hosts: {
            one: 'localhost:' + portOne,
            two: 'localhost:' + portTwo
        },
        destroy: destroy
    };

    function destroy() {
        one.quit();
        two.quit();
    }
}

function randomPort() {
    return 20000 + Math.floor(Math.random() * 20000);
}
