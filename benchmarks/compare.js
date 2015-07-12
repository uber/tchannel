// Copyright (c) 2015 Uber Technologies, Inc.

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

var parseArgs = require('minimist');
var fs = require('fs');
var ldj = require('ldjson-stream');
var parallel = require('run-parallel');
var util = require('util');

var argv = parseArgs(process.argv.slice(2), {
    default: {
         stat: 'rate'
    }
});

if (argv._.length !== 2) {
    console.error('usage: compare.js a.json b.json');
    process.exit(1);
}

readSamples(argv._, function(err, samples) {
    if (err) throw err;

    var keys = {};
    var maxKeyLen = 0;
    samples.forEach(function(sample) {
        Object.keys(sample).forEach(function(key) {
            maxKeyLen = Math.max(maxKeyLen, key.length);
            keys[key] = true;
        });
    });

    var sampleA = samples[0];
    var sampleB = samples[1];
    Object.keys(keys).sort().forEach(function(key) {
        var aData = sampleA[key];
        var bData = sampleB[key];
        if (aData === undefined) {
            console.error(util.format('sampleA data missing for key %j', key));
            return;
        }
        if (bData === undefined) {
            console.error(util.format('sampleB data missing for key %j', key));
            return;
        }

        aData = extractDim(argv.stat, aData);
        if (aData.missing) {
            console.error(util.format(
                'sampleA data missing %s values for stat %s for key %j',
                aData.missing, argv.stat, key));
            return;
        }
        aData = aData.data;

        bData = extractDim(argv.stat, bData);
        if (bData.missing) {
            console.error(util.format(
                'sampleB data missing %s values for stat %s for key %j',
                bData.missing, argv.stat, key));
            return;
        }
        bData = bData.data;

        // TODO: improve on this
        var aStats = descStats(aData);
        var bStats = descStats(bData);
        var diff = bStats.whi - aStats.whi;
        var diffPct = diff / aStats.whi;
        console.log(util.format(
            '%s %s: hi-diff: %s (%s%%)',
            rpad(key, maxKeyLen),
            argv.stat,
            lpad(diff.toFixed(2), 9),
            lpad((100 * diffPct).toFixed(1), 5)
        ));
    });
});

// return basic descriptive stats of some numerical sample
function descStats(sample) {
    var S = [].concat(sample);
    S.sort(function(a, b) {return a - b;});
    var N = S.length;
    var q1 = S[Math.floor(0.25 * N)];
    var q2 = S[Math.floor(0.50 * N)];
    var q3 = S[Math.floor(0.70 * N)];
    var iqr = q3 - q1;
    var tol = 3 * iqr / 2;
    var hi = q3 + tol;
    var whiIndex = N;
    while (--whiIndex > 0) {
        if (S[whiIndex] <= hi) break;
    }
    var whiPct = (whiIndex+1) / N;
    var whi = S[whiIndex];
    return {
        min: S[0],
        max: S[N-1],
        q1: q1,
        q2: q2,
        q3: q3,
        hi: hi,
        whi: whi,
        whiPct: whiPct
    };
}

function readSamples(files, callback) {
    parallel(files.map(function forEachFile(file) {
        return function thunk(done) {
            var sample = {};
            fs.createReadStream(file)
                .pipe(ldj.parse())
                .on('data', storeResultInto(sample))
                .on('error', finish)
                .on('end', finish);

            function finish(err) {
                sample = combineSamples(sample);

                done(err, sample);
            }
        };
    }), callback);
}

function combineSamples(sample) {
    var keys = Object.keys(sample);

    // For each type of test
    for (var i = 0; i < keys.length; i++) {
        var instancesData = sample[keys[i]];
        var results = [];

        // For each child process
        var subKeys = Object.keys(instancesData);
        for (var j = 0; j < subKeys.length; j++) {
            var value = instancesData[subKeys[j]];

            // For each run of that test
            for (var k = 0; k < value.length; k++) {
                var statObj = value[k];

                if (!results[k]) {
                    results[k] = {
                        numRequests: statObj.numRequests,
                        elapsed: statObj.elapsed,
                        rate: statObj.numRequests / (statObj.elapsed / 1000)
                    };
                } else {
                    results[k].numRequests += statObj.numRequests;
                    results[k].elapsed = Math.min(
                        results[k].elapsed, statObj.elapsed
                    );
                    results[k].rate = results[k].numRequests / (results[k].elapsed / 1000);
                }
            }
        }

        sample[keys[i]] = results;
    }

    return sample;
}

function storeResultInto(sample) {
    return function storeResult(result) {
        var key = util.format('%s, %s/%s',
            result.descr, result.pipeline, result.numClients
        );

        var results = sample[key];
        if (!results) {
            results = sample[key] = {};
        }

        var instanceArray = results[result.instanceNumber];
        if (!instanceArray) {
            instanceArray = results[result.instanceNumber] = [];
        }

        instanceArray.push(result);
    };
}

function lpad(input, len, chr) {
    var str = input.toString();
    chr = chr || " ";
    while (str.length < len) {
        str = chr + str;
    }
    return str;
}

function rpad(input, len, chr) {
    var str = input.toString();
    chr = chr || " ";
    while (str.length < len) {
        str = str + chr;
    }
    return str;
}

function extractDim(name, sample) {
    var missing = 0;
    var data = sample.map(function(data) {
        var d = data[name];
        if (d === undefined) ++missing;
        return d;
    });
    return {
        missing: missing,
        data: data
    };
}
