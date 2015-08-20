'use strict';

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('forwarding to non existant service', {
    size: 5
}, function t(cluster, assert) {
    var bob = cluster.remotes.bob;

    bob.clientChannel.request({
        serviceName: 'non-existant'
    }).send('wat', null, null, onForwarded);

    function onForwarded(err, res1, res2) {
        assert.ok(err);

        assert.equal(err.type, 'tchannel.declined');
        assert.equal(err.message.indexOf('no peer available for'), 0);
        assert.equal(err.isErrorFrame, true);

        assert.end();
    }
});
