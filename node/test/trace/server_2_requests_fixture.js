var validators = require('../lib/simple-validators');

var idStore = {};

module.exports = [
    {
        "name": "subservice2",
        "endpoint": {
            "ipv4": "127.0.0.1",
            "port": 4042
        },
        "traceid": validators.checkId(idStore, 'traceid'),
        "parentid": validators.checkId(idStore, 'first_spanid'),
        "spanid": validators.checkId(idStore, 'third_spanid'),
        "annotations": [
            {
                "value": "sr",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4042
                }
            },
            {
                "value": "ss",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4042
                }
            }
        ],
        "binaryAnnotations": []
    },
    {
        "name": "subservice2",
        "endpoint": {
            "ipv4": "127.0.0.1",
            "port": 4042
        },
        "traceid": validators.checkId(idStore, 'traceid'),
        "parentid": validators.checkId(idStore, 'first_spanid'),
        "spanid": validators.checkId(idStore, 'third_spanid'),
        "annotations": [
            {
                "value": "cs",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4042
                }
            },
            {
                "value": "cr",
                "timestamp": validators.timestamp,
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
                "value": "sr",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4042
                }
            },
            {
                "value": "ss",
                "timestamp": validators.timestamp,
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
                "value": "cs",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4042
                }
            },
            {
                "value": "cr",
                "timestamp": validators.timestamp,
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
                "value": "sr",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4040
                }
            },
            {
                "value": "ss",
                "timestamp": validators.timestamp,
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
                "value": "cs",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4040
                }
            },
            {
                "value": "cr",
                "timestamp": validators.timestamp,
                "host": {
                    "ipv4": "127.0.0.1",
                    "port": 4040
                }
            }
        ],
        "binaryAnnotations": []
    }
];
