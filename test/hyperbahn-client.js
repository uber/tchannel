'use strict';

var TestCluster = require('./lib/test-cluster.js');

require('tchannel/test/hyperbahn/forward.js')(TestCluster);
require('tchannel/test/hyperbahn/advertise.js')(TestCluster);
require('tchannel/test/hyperbahn/unadvertise.js')(TestCluster);
require('tchannel/test/hyperbahn/forward-retry.js')(TestCluster);

require('tchannel/test/hyperbahn/hyperbahn-down.js')(TestCluster);
require('tchannel/test/hyperbahn/hyperbahn-times-out.js')(TestCluster);

require('tchannel/test/hyperbahn/rate-limiter.js')(TestCluster);
