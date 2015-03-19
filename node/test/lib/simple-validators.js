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

module.exports.validate = function validate(assert, actual, expected) {
    Object.keys(expected).forEach(function (key) {
        var actualValue = actual[key];
        var expectedValue = expected[key];

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
    });
};

