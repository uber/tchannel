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

var assert = require('assert');

// Peer and Circuit are state machines.

module.exports = StateMachine;

function StateMachine() {
    var self = this;
    self.state = null;
    self.stateOptions = null;
}

StateMachine.prototype.setState = function setState(StateType) {
    var self = this;

    var currentType = self.state && self.state.type;
    if (currentType &&
        StateType.prototype.type &&
        StateType.prototype.type === currentType) {
        return null;
    }

    assert(self.stateOptions, 'state machine must have stateOptions');
    var state = new StateType(self.stateOptions);
    if (state && state.type === currentType) {
        return null;
    }

    var oldState = self.state;
    self.state = state;
    self.stateChangedEvent.emit(self, [oldState, state]);
    return state;
};
