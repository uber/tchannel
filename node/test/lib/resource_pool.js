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

function ResourcePool(setup, destroy) {
    var self = this;
    self.free = [];
    self.setup = setup;
    self.destroyRes = destroy || callDestroy;
}

ResourcePool.prototype.get = function getCluster(callback) {
    var self = this;
    if (self.free.length) {
        callback(null, self.free.shift());
    } else {
        self.setup(callback);
    }
};

ResourcePool.prototype.release = function release(res) {
    var self = this;
    self.free.push(res);
};

ResourcePool.prototype.destroy = function destroy(callback) {
    var self = this;
    var free = self.free;
    var errs = [];
    self.free = [];
    var toDestroy = free.length;
    free.forEach(function each(res) {
        self.destroyRes(res, destroyed);
    });

    function destroyed(err) {
        if (err) errs.push(err);
        if (--toDestroy <= 0) {
            if (toDestroy < 0) {
                errs.push(new Error('too many destroyed callbacks'));
            }
            finish();
        }
    }

    function finish() {
        // TODO: aggregated error wrapper?
        var err = errs.length && errs[errs.length - 1] || null;
        callback(err);
    }
};

function callDestroy(res, callback) {
    res.destroy(callback);
}

module.exports = ResourcePool;
