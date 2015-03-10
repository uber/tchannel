var test = require('tape');

var TChannel = require('../index.js');

test('listening on a used port', function t(assert) {
    var otherServer = TChannel();
    var server = TChannel();

    otherServer.once('listening', onPortAllocated);
    otherServer.listen(0, 'localhost');

    function onPortAllocated() {
        server.on('error', onError);

        server.listen(otherServer.address().port, 'localhost');
    }

    function onError(err) {
        assert.notEqual(-1, err.message
            .indexOf('tchannel: listen EADDRINUSE'));
        assert.equal(err.type, 'tchannel.server.listen-failed');
        assert.equal(err.requestedPort,
            otherServer.address().port);
        assert.equal(err.host, 'localhost');
        assert.equal(err.code, 'EADDRINUSE');
        assert.equal(err.errno, 'EADDRINUSE');
        assert.equal(err.syscall, 'listen');
        assert.notEqual(-1, err.origMessage
            .indexOf('listen EADDRINUSE'));

        otherServer.close();
        assert.end();
    }
});
