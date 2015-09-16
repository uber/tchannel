// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var TestCluster = require('./lib/test-cluster.js');

require('./hyperbahn-client/constructor.js');
require('./hyperbahn-client/todo.js');
require('./hyperbahn-client/sub-channel.js');
require('./hyperbahn-client/kill-switch.js');
require('./hyperbahn-client/egress-nodes.js');

require('./hyperbahn-client/forward.js')(TestCluster);
require('./hyperbahn-client/advertise.js')(TestCluster);
require('./hyperbahn-client/unadvertise.js')(TestCluster);
// require('./hyperbahn-client/hostports.js')(TestCluster);
require('./hyperbahn-client/forward-retry.js')(TestCluster);

require('./hyperbahn-client/hyperbahn-down.js')(TestCluster);
require('./hyperbahn-client/hyperbahn-times-out.js')(TestCluster);

require('./hyperbahn-client/rate-limiter.js')(TestCluster);
