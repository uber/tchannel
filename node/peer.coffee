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

TChannelPeer = (channel, hostPort, options) ->
    if !(this instanceof TChannelPeer)
        return new TChannelPeer(channel, hostPort, options)
    self = this
    EventEmitter.call self
    self.channel = channel
    self.logger = self.channel.logger
    self.options = options or {}
    self.hostPort = hostPort
    self.isEphemeral = self.hostPort == '0.0.0.0:0'
    self.state = null
    # TODO
    self.connections = []
    if self.options.initialState
        self.setState self.options.initialState
        delete self.options.initialState
    else
        self.setState TChannelPeerHealthyState
    return

'use strict'
assert = require('assert')
inherits = require('util').inherits
EventEmitter = require('events').EventEmitter
net = require('net')
TChannelConnection = require('./connection')
TChannelPeerHealthyState = require('./peer_states').TChannelPeerHealthyState
inherits TChannelPeer, EventEmitter

TChannelPeer::isConnected = (direction, identified) ->
    self = this
    if identified == undefined
        identified = true
    i = 0
    while i < self.connections.length
        conn = self.connections[i]
        if direction and conn.direction != direction
                        i++
            continue
        else if conn.closing
                        i++
            continue
        else if conn.remoteName != null or !identified
            return true
        i++
    false

TChannelPeer::close = (callback) ->
    self = this
    counter = self.connections.length

    onClose = ->
        if --counter <= 0
            if counter < 0
                self.logger.error 'closed more peer sockets than expected', counter: counter
            self.state.close callback
        return

    if counter
        self.connections.forEach (conn) ->
            conn.close onClose
            return
    else
        self.state.close callback
    return

TChannelPeer::setState = (StateType) ->
    self = this
    currentType = self.state and self.state.type
    if currentType and StateType::type and StateType::type == currentType
        return
    state = new StateType(self.channel, self)
    if state and state.type == currentType
        return
    oldState = self.state
    self.state = state
    self.emit 'stateChanged', oldState, state
    return

TChannelPeer::getInConnection = ->
    self = this
    i = 0
    while i < self.connections.length
        conn = self.connections[i]
        if !conn.closing
            return conn
        i++
    null

TChannelPeer::getOutConnection = ->
    self = this
    i = self.connections.length - 1
    while i >= 0
        conn = self.connections[i]
        if !conn.closing
            return conn
        i--
    null

TChannelPeer::connect = (outOnly) ->
    self = this
    conn = self.getOutConnection()
    if !conn or outOnly and conn.direction != 'out'
        socket = self.makeOutSocket()
        conn = self.makeOutConnection(socket)
        self.addConnection conn
    conn

TChannelPeer::request = (options) ->
    self = this
    req = self.connect().request(options)

    onError = (err) ->
        self.state.onRequestError req
        return

    onResponse = (res) ->
        self.state.onRequestResponse req
        return

    self.state.onRequest req
    req.on 'error', onError
    req.on 'response', onResponse
    req

TChannelPeer::addConnection = (conn) ->
    self = this
    # TODO: first approx alert for self.connections.length > 2
    # TODO: second approx support pruning

    onConnectionError = ->
        # TODO: log?
        self.removeConnection conn
        return

    if conn.direction == 'out'
        self.connections.push conn
    else
        self.connections.unshift conn
    conn.once 'error', onConnectionError
    conn

TChannelPeer::removeConnection = (conn) ->
    self = this
    list = self.connections
    index = if list then list.indexOf(conn) else -1
    if index != -1
        list.splice(index, 1)[0]
    else
        null

TChannelPeer::makeOutSocket = ->
    self = this
    parts = self.hostPort.split(':')
    assert parts.length == 2, 'invalid destination'
    host = parts[0]
    port = parts[1]
    assert host != '0.0.0.0', 'cannot connect to ephemeral peer'
    assert port != '0', 'cannot connect to dynamic port'
    socket = net.createConnection(
        host: host
        port: port)
    socket

TChannelPeer::makeOutConnection = (socket) ->
    self = this
    chan = self.channel.topChannel or self.channel
    conn = new TChannelConnection(chan, socket, 'out', self.hostPort)
    self.emit 'allocConnection', conn
    conn

module.exports = TChannelPeer
