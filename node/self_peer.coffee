# Copyright (c) 2015 Uber Technologies, Inc.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

TChannelSelfPeer = (channel) ->
    if !(this instanceof TChannelSelfPeer)
        return new TChannelSelfPeer(channel)
    self = this
    TChannelPeer.call self, channel, channel.hostPort
    return

'use strict'
assert = require('assert')
inherits = require('util').inherits
TChannelPeer = require('./peer')
TChannelSelfConnection = require('./self_connection')
inherits TChannelSelfPeer, TChannelPeer

TChannelSelfPeer::connect = ->
    self = this
    while self.connections[0] and self.connections[0].closing
        self.connections.shift()
    conn = self.connections[0]
    if !conn
        conn = TChannelSelfConnection(self.channel)
        self.addConnection conn
    conn

TChannelSelfPeer::makeOutSocket = ->
    assert false, 'refusing to make self out socket'
    return

TChannelSelfPeer::makeOutConnection = ->
    assert false, 'refusing to make self out connection'
    return

module.exports = TChannelSelfPeer
