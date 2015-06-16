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

module.exports.timestamp = function (assert, value) {
    assert.ok(typeof value === 'number');
    assert.ok(value.toString().length === 13);
};

// Sets the first time it's seen then validates the rest of the time
module.exports.checkId = function (idStore, idKey) {
    return function (assert, id, key) {
        if (!idStore[idKey]) {
            idStore[idKey] = id;
            return;
        }

        assert.equals(id, idStore[idKey], "idKey: " + idKey + " key: " + key);
    };
};

module.exports.validateSpans =
function validateSpans(assert, actual, expected) {
    // Spans may be received in a different order than in the fixture, so we
    // need to find a way to identify them in order to check their contents.
    // Unfortunately since the ids are randomly generated we can't use those.
    // So we base an id off the contents and then validate.

    var actualById = {};
    actual.forEach(function (item) {
        actualById[uniqueSpanId(item)] = item;
    });

    expected.forEach(function (item) {
        var id = uniqueSpanId(item);
        var actualValue = actualById[id];
        if (!actualValue) {
            assert.fail('missing span id ' + id);
        } else {
            validateOne(assert, actualValue, item);
        }
    });

    // TODO: assert that we didn't get any extra spans
};

function uniqueSpanId(item) {
    return item.name +
           item.endpoint.ipv4 +
           item.endpoint.port +
           catValues(item.annotations);
}

function catValues(array) {
    return array.reduce(catValue, '');
    function catValue(str, item) {
        return str + item.value;
    }
}

function validateOne(assert, actual, expected) {
    if (Buffer.isBuffer(actualValue)) {
        actualValue = actualValue.toString('hex');
    }

    if (typeof expectedValue === 'function') {
        return expectedValue(assert, actualValue, key);
    }

    if (typeof expectedValue === 'object') {
        return validate(assert, actualValue, expectedValue);
    }

    assert.equals(actualValue, expectedValue, "key: " + key);
}

module.exports.validate = function validate(assert, actual, expected) {
    Object.keys(expected).forEach(function (key) {
        var actualValue = actual[key];
        var expectedValue = expected[key];
        validateOne(assert, actualValue, expectedValue);
    });
};

