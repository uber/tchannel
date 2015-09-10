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

var TypedError = require('error/typed');

var ManyErrors = module.exports.ManyErrors = TypedError({
    type: 'many.errors',
    message: '{count} errors. Example: {example}',
    count: null,
    example: null,
    errors: null
});

module.exports.resultArrayToError = resultArrayToError;

function resultArrayToError(items, type, message) {
    var errors = [];
    var i;
    for (i = 0; i < items.length; i++) {
        if (items[i].err) {
            errors.push(items[i].err);
        }
    }

    return errorArrayToError(errors, type, message);
}

module.exports.errorArrayToError = errorArrayToError;

function errorArrayToError(errors, type, message) {
    if (errors.length === 0) {
        return null;
    } else if (errors.length === 1) {
        return errors[0];
    } else {
        return ManyErrors({
            message: message,
            type: type,
            errors: errors,
            count: errors.length,
            example: errors[0].message
        });
    }
}
