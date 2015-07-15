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

// Random sampling functions borrowed from python standard library

var RandomSample = module.exports;
RandomSample.variate = {};

RandomSample.variate.norm = function normalvariate(mu, sigma, random) {
    var nvMagicConst = 4 * Math.exp(-0.5) / Math.sqrt(2.0);
    return function sampleNormalRandom() {
        while (true) {
            var u1 = random();
            var u2 = 1.0 - random();
            var z = nvMagicConst * (u1 - 0.5) / u2;
            var zz = z * z / 4.0;
            if (zz <= -Math.log(u2)) {
                return mu + z * sigma;
            }
        }
    };
};

RandomSample.variate.expo = function expovariate(mu, random) {
    return function sampleExponentialRandom() {
        return -Math.log(1 - random()) * mu;
    };
};

RandomSample.fromString = function fromString(str, random) {
    if (!random) {
        random = Math.random;
    }

    // norm:mu,sigma
    // expo:mu
    var match = /^(\w+):(.+)$/.exec(str);
    if (!match) {
        throw new Error('invalid random sample spec, expected "kind:arg[,arg[,...]]"');
    }
    var kind = match[1];
    str = match[2];

    var variate = RandomSample.variate[kind];
    if (!variate) {
        throw new Error('invalid random sample kind ' + kind);
    }

    var args = str.split(',');
    if (args.length !== variate.length-1) {
        throw new Error('wrong number of args for random sample kind ' + kind);
    }

    for (var i = 0; i < args.length; i++) {
        var n = parseFloat(args[i]);
        if (isNaN(n)) {
            throw new Error('invalid argument, not a number: ' + args[i]);
        }
        args[i] = n;
    }

    args.push(random);
    return variate.apply(null, args);
};
