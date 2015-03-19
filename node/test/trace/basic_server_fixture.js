var validators = require('../lib/simple-validators');

var idStore = {};

module.exports = [
    {
        "name": "subservice",
        "endpoint": {
            "ipv4": "127.0.0.1",
            "port": 4042
        },
        "traceid": validators.checkId(idStore, 'traceid'),
        "parentid": validators.checkId(idStore, 'first_spanid'),
        "spanid": validators.checkId(idStore, 'second_spanid'),
        "annotations": [
            {
                "timestamp": validators.timestamp,
                "value": "sr",
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4042
                }
            },
            {
                "timestamp": validators.timestamp,
                "value": "ss",
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4042
                }
            }
        ],
        "binaryAnnotations": []
    },
    {
        "name": "subservice",
        "endpoint": {
            "ipv4": "127.0.0.1",
            "port": 4042
        },
        "traceid": validators.checkId(idStore, 'traceid'),
        "parentid": validators.checkId(idStore, 'first_spanid'),
        "spanid": validators.checkId(idStore, 'second_spanid'),
        "annotations": [
            {
                "timestamp": validators.timestamp,
                "value": "cs",
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4042
                }
            },
            {
                "timestamp": validators.timestamp,
                "value": "cr",
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4042
                }
            }
        ],
        "binaryAnnotations": []
    },
    {
        "name": "/top_level_endpoint",
        "endpoint": {
            "ipv4": "127.0.0.1",
            "port": 4040
        },
        "traceid": validators.checkId(idStore, 'traceid'),
        "parentid": "0000000000000000",
        "spanid": validators.checkId(idStore, 'first_spanid'),
        "annotations": [
            {
                "timestamp": validators.timestamp,
                "value": "sr",
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4040
                }
            },
            {
                "timestamp": validators.timestamp,
                "value": "ss",
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4040
                }
            }
        ],
        "binaryAnnotations": []
    },
    {
        "name": "/top_level_endpoint",
        "endpoint": {
            "ipv4": "127.0.0.1",
            "port": 4040
        },
        "traceid": validators.checkId(idStore, 'traceid'),
        "parentid": "0000000000000000",
        "spanid": validators.checkId(idStore, 'first_spanid'),
        "annotations": [
            {
                "timestamp": validators.timestamp,
                "value": "cs",
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4040
                }
            },
            {
                "timestamp": validators.timestamp,
                "value": "cr",
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4040
                }
            }
        ],
        "binaryAnnotations": []
    }
];

