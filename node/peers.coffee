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

TChannelPeers = (channel, options) ->
    if !(this instanceof TChannelPeers)
        return new TChannelPeers(channel, options)
    self = this
    EventEmitter.call self
    self.channel = channel
    self.logger = self.channel.logger
    self.options = options or {}
    self._map = Object.create(null)
    self.selfPeer = TChannelSelfPeer(self.channel)
    return

'use strict'
assert = require('assert')
inherits = require('util').inherits
EventEmitter = require('events').EventEmitter
errors = require('./errors')
TChannelPeer = require('./peer')
TChannelSelfPeer = require('./self_peer')
inherits TChannelPeers, EventEmitter

TChannelPeers::close = (callback) ->
    self = this
    peers = [ self.selfPeer ].concat(self.values())
    counter = peers.length

    onClose = ->
        if --counter <= 0
            if counter < 0
                self.logger.error 'closed more peers than expected', counter: counter
            callback()
        return

    peers.forEach (peer) ->
        peer.close onClose
        return
    self.clear()
    return

TChannelPeers::get = (hostPort) ->
    self = this
    self._map[hostPort] or null

TChannelPeers::add = (hostPort, options) ->
    self = this
    peer = self._map[hostPort]
    if !peer
        if hostPort == self.channel.hostPort
            return self.selfPeer
        if self.channel.topChannel
            peer = self.channel.topChannel.peers.add(hostPort)
        else
            peer = TChannelPeer(self.channel, hostPort, options)
            self.emit 'allocPeer', peer
        self._map[hostPort] = peer
    peer

TChannelPeers::addPeer = (peer) ->
    self = this
    assert peer instanceof TChannelPeer, 'invalid peer'
    assert !self._map[peer.hostPort], 'peer already defined'
    if peer.hostPort != self.channel.hostPort
        self._map[peer.hostPort] = peer
    return

TChannelPeers::keys = ->
    self = this
    Object.keys self._map

TChannelPeers::values = ->
    self = this
    keys = Object.keys(self._map)
    ret = new Array(keys.length)
    i = 0
    while i < keys.length
        ret[i] = self._map[keys[i]]
        i++
    ret

TChannelPeers::entries = ->
    self = this
    keys = Object.keys(self._map)
    ret = new Array(keys.length)
    i = 0
    while i < keys.length
        ret[i] = [
            keys[i]
            self._map[keys[i]]
        ]
        i++
    ret

TChannelPeers::clear = ->
    self = this
    keys = self.keys()
    vals = new Array(keys.length)
    i = 0
    while i < keys.length
        vals[i] = self._map[keys[i]]
        delete self._map[keys[i]]
        i++
    vals

TChannelPeers::delete = (hostPort) ->
    self = this
    peer = self._map[hostPort]
    delete self._map[hostPort]
    if self.subChannels
        names = Object.keys(self.subChannels)
        i = 0
        while i < names.length
            self.subChannels[names[i]].delete hostPort
            i++
    peer

TChannelPeers::request = (req, options) ->
    self = this
    peer = self.choosePeer(req, options)
    if !peer
        throw errors.NoPeerAvailable()
    # TODO: operational error?
    peer.request options

TChannelPeers::choosePeer = (req, options) ->
    self = this
    if !options
        options = {}
    hosts = null
    if options.host
        return self.add(options.host)
    else
        hosts = Object.keys(self._map)
    if !hosts or !hosts.length
        return null
    threshold = options.peerScoreThreshold
    if threshold == undefined
        threshold = self.options.peerScoreThreshold
    if threshold == undefined
        threshold = 0
    selectedPeer = null
    selectedScore = 0
    i = 0
    while i < hosts.length
        hostPort = hosts[i]
        peer = self.add(hostPort)
        if !req or !req.triedRemoteAddrs[hostPort]
            score = peer.state.shouldRequest(req, options)
            want = score > threshold and (selectedPeer == null or score > selectedScore)
            if want
                selectedPeer = peer
                selectedScore = score
        i++
    selectedPeer

module.exports = TChannelPeers
