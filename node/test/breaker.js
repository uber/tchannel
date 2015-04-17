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

var tape = require('tape');
var MockTimers = require('time-mock');
var Breaker = require('../breaker');

var timers = MockTimers(Date.now());
var breaker = new Breaker({
    timers: timers,
    period: 1000,
    tripRate: .51,
    probation: 3
}, function handleRequest() {
    // unused
});

tape('breaker healthy', function t(assert) {
    breaker.state.handleFinish();
    breaker.state.handleFinish();
    breaker.state.handleFinish();
    breaker.state.handleFinish();
    assert.equals(breaker.state.name, 'healthy');
    assert.ok(breaker.state.shouldHandleRequest(), 'healthy flush with success');
    assert.end();
});

tape('healthy after first period', function t(assert) {
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'still healthy');
    assert.equals(breaker.state.name, 'healthy');
    assert.end();
});

tape('unhealthy after period with partial success', function t(assert) {

    breaker.state.handleError('UnexpectedError');
    breaker.state.handleFinish();
    assert.equals(breaker.state.name, 'healthy');
    assert.ok(breaker.state.shouldHandleRequest(), 'still healthy');

    timers.advance(1000);
    assert.notOk(breaker.state.shouldHandleRequest(), 'no longer healthy');
    assert.equals(breaker.state.name, 'unhealthy');

    assert.end();
});

tape('one check per probation', function t(assert) {

    // 1st probation period does not allow any requests
    assert.notOk(breaker.state.shouldHandleRequest(), 'first request denied');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');

    // 2nd
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');

    // 3rd
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');

    assert.end();
});

tape('consecutive successes during probation reset breaker', function t(assert) {

    // 1st
    breaker.state.handleFinish();
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');

    // 2nd
    breaker.state.handleFinish();
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');

    // 3rd
    breaker.state.handleFinish();
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');
    assert.equals(breaker.state.name, 'unhealthy');

    // 4th successful period resets breaker to healthy state
    breaker.state.handleFinish();
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.ok(breaker.state.shouldHandleRequest(), 'subsequent request allowed');
    assert.equals(breaker.state.name, 'healthy');

    assert.end();
});

tape('failure trips breaker again', function t(assert) {
    breaker.state.handleError('UnexpectedError');
    timers.advance(1000);
    assert.notOk(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');
    assert.equals(breaker.state.name, 'unhealthy');

    assert.end();
});

tape('bad failure ratio resets the probation', function t(assert) {

    // 1st (.5 failure rate)
    breaker.state.handleFinish();
    breaker.state.handleError('UnexpectedError');
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');

    // 2nd (.5 failure rate)
    breaker.state.handleFinish();
    breaker.state.handleError('UnexpectedError');
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');

    // 3rd (0 failure rate, clock starts)
    breaker.state.handleFinish();
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');
    assert.equals(breaker.state.name, 'unhealthy');

    // 4th period and probation continues (1 successful period)
    breaker.state.handleFinish();
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');
    assert.equals(breaker.state.name, 'unhealthy');

    // 5th period and probation continues (2 successful)
    breaker.state.handleFinish();
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.notOk(breaker.state.shouldHandleRequest(), 'subsequent request denied');
    assert.equals(breaker.state.name, 'unhealthy');

    // 6th period and probation is over (3 successful periods)
    breaker.state.handleFinish();
    timers.advance(1000);
    assert.ok(breaker.state.shouldHandleRequest(), 'first request allowed');
    assert.ok(breaker.state.shouldHandleRequest(), 'subsequent request allowed');
    assert.equals(breaker.state.name, 'healthy');

    assert.end();
});
