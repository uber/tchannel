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

function EventEmitter() {
}

EventEmitter.prototype.defineEvent =
function defineEvent(type, defaultListener) {
    if (!defaultListener && type === 'error') {
        defaultListener = defaultErrorListener;
    }
    return new DefinedEvent(type, defaultListener);
};

EventEmitter.prototype.on =
EventEmitter.prototype.addListener =
function addListener(type, listener) {
    this[type + 'Event'].addListener(listenerCompatShim);
    listenerCompatShim.listener = listener;
    function listenerCompatShim(arg, self) {
        listener.call(self, arg);
    }
};

EventEmitter.prototype.removeListener =
function removeListener(type, listener) {
    var evt = this[type + 'Event'];
    if (evt.listener && evt.listener.listener === listener) {
        evt.listener = null;
    } else if (evt.listeners.length) {
        var listeners = [];
        for (var i = 0; i < evt.listeners.length; i++ ) {
            if (evt.listeners[i].listener !== listener) {
                listeners.push(evt.listeners[i]);
            }
        }
        if (listeners.length === 1) {
            evt.listener = listeners.pop();
        }
        evt.listeners = listeners;
    }
};

EventEmitter.prototype.removeAllListeners =
function removeAllListeners(type) {
    assert(type, 'not implemented: removing all listeners from all event types');
    this[type + 'Event'].removeAllListeners();
};

EventEmitter.prototype.emit =
function emit(type, arg) {
    this[type + 'Event'].emit(this, arg);
};

function DefinedEvent(type, defaultListener) {
    this.type = type;
    this.defaultListener = defaultListener;
    this.listener = null;
    this.listeners = [];
}

DefinedEvent.prototype.emit =
function emit(that, arg) {
    if (this.listener) {
        this.listener(arg, that);
    } else if (this.listeners.length) {
        var listeners = this.listeners;
        for (var i = 0; i < listeners.length; i++ ) {
            listeners[i](arg, that);
        }
    } else if (this.defaultListener) {
        this.defaultListener(arg, that);
    }
};

DefinedEvent.prototype.on =
DefinedEvent.prototype.addListener =
function addListener(listener) {
    if (this.listeners.length) {
        this.listeners.push(listener);
    } else if (this.listener) {
        this.listeners.push(this.listener, listener);
        this.listener = null;
    } else {
        this.listener = listener;
    }
};

DefinedEvent.prototype.removeListener =
function removeListener(listener) {
    if (this.listener) {
        if (this.listener === listener) {
            this.listener = null;
        }
    } else if (this.listeners.length) {
        var listeners = [];
        for (var i = 0; i < this.listeners.length; i++ ) {
            if (this.listeners[i] !== listener) {
                listeners.push(this.listeners[i]);
            }
        }
        if (listeners.length === 1) {
            this.listener = listeners.pop();
        }
        this.listeners = listeners;
    }
};

DefinedEvent.prototype.removeAllListeners =
function removeAllListeners() {
    this.listener = null;
    this.listeners = [];
};

function defaultErrorListener(err) {
    if (!err) {
        err = new TypeError('Uncaught, unspecified "error" event.');
    }
    throw err;
}

module.exports = EventEmitter;
