module.exports.verify = verify;

function verify(assert, actual, expected) {
    var keys = Object.keys(actual);
    var i;
    var key;
    for (i = 0; i < keys.length; i++) {
        key = keys[i];
        if (typeof actual[key] === 'object') {
            verify(assert, actual[key], expected[key]);
        } else if (typeof expected[key] === 'function') {
            expected[key](assert, actual[key]);
        } else {
            assert.equals(actual[key], expected[key]);
        }
    }
}

function isNumber(assert, value) {
    assert.ok(typeof value === 'number', 'expected number');
}

function isLoHostPort(assert, value) {
    var parts = value.split(':');
    assert.ok(parts.length === 2, 'value ' + value + ' splits into two parts');
    assert.ok(parts[0] === '127.0.0.1', value + ' is a lo host:port');
    assert.ok(
        parseInt(parts[1]).toString() === parts[1],
        value + ' has number port'
    );
}

var fixture = module.exports.fixture = [
    {
        "name": "tchannel.inbound.request.size",
        "type": "counter",
        "value": isNumber,
        "tags": {
            "app": "",
            "host": "",
            "cluster": "",
            "version": "",
            "callingService": "wat",
            "service": "two",
            "endpoint": "echo"
        }
    },
    {
        "name": "tchannel.inbound.calls.recvd",
        "type": "counter",
        "value": isNumber,
        "tags": {
            "app": "",
            "host": "",
            "cluster": "",
            "version": "",
            "callingService": "wat",
            "service": "two",
            "endpoint": "echo"
        }
    },
    {
        "name": "tchannel.relay.latency",
        "type": "timing",
        "value": isNumber,
        "tags": {
            "app": "",
            "host": "",
            "cluster": "",
            "version": ""
        }
    },
    {
        "name": "tchannel.outbound.calls.sent",
        "type": "counter",
        "value": isNumber,
        "tags": {
            "app": "",
            "host": "",
            "cluster": "",
            "version": "",
            "targetService": "two",
            "service": "wat",
            "targetEndpoint": "echo"
        }
    },
    {
        "name": "tchannel.outbound.request.size",
        "type": "counter",
        "value": isNumber,
        "tags": {
            "app": "",
            "host": "",
            "cluster": "",
            "version": "",
            "targetService": "two",
            "service": "wat",
            "targetEndpoint": "echo"
        }
    },
    {
        "name": "tchannel.inbound.response.size",
        "type": "counter",
        "value": isNumber,
        "tags": {
            "app": "",
            "host": "",
            "cluster": "",
            "version": "",
            "callingService": "wat",
            "service": "two",
            "endpoint": "echo"
        }
    },
    {
        "name": "tchannel.outbound.calls.per-attempt-latency",
        "type": "timing",
        "value": isNumber,
        "tags": {
            "app": "",
            "host": "",
            "cluster": "",
            "version": "",
            "targetService": "two",
            "service": "wat",
            "targetEndpoint": "echo",
            "peer": isLoHostPort,
            "retryCount": 0
        }
    },
    {
        "name": "tchannel.outbound.calls.success",
        "type": "counter",
        "value": isNumber,
        "tags": {
            "app": "",
            "host": "",
            "cluster": "",
            "version": "",
            "targetService": "two",
            "service": "wat",
            "targetEndpoint": "echo"
        }
    },
    {
        "name": "tchannel.inbound.calls.success",
        "type": "counter",
        "value": isNumber,
        "tags": {
            "app": "",
            "host": "",
            "cluster": "",
            "version": "",
            "callingService": "wat",
            "service": "two",
            "endpoint": "echo"
        }
    },
    {
        "name": "tchannel.outbound.response.size",
        "type": "counter",
        "value": isNumber,
        "tags": {
            "app": "",
            "host": "",
            "cluster": "",
            "version": "",
            "targetService": "two",
            "service": "wat",
            "targetEndpoint": "echo"
        }
    },
    {
        "name": "tchannel.inbound.calls.latency",
        "type": "timing",
        "value": isNumber,
        "tags": {
            "app": "",
            "host": "",
            "cluster": "",
            "version": "",
            "callingService": "wat",
            "service": "two",
            "endpoint": "echo"
        }
    }
]
