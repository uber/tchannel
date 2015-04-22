# Copyright (c) 2015 Uber Technologies, Inc.
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
TChannel = require('../channel.js')
EndpointHandler = require('../endpoint-handler.js')
CountedReadySignal = require('ready-signal/counted')
async = require('async')
server = new TChannel(handler: EndpointHandler())
client = new TChannel(handler: EndpointHandler())
# bidirectional messages
server.handler.register 'ping', (req, res) ->
    console.log 'server got ping req from ' + req.remoteAddr
    res.sendOk 'pong', null
    return
client.handler.register 'ping', (req, res) ->
    console.log 'client got ping req from ' + req.remoteAddr
    res.sendOk 'pong', null
    return
ready = CountedReadySignal(2)
listening = ready((err) ->
    if err
        throw err
    async.series [
        (done) ->
            client.request(host: '127.0.0.1:4040').send 'ping', null, null, (err, res) ->
                console.log 'ping res from client: ' + res.arg2 + ' ' + res.arg3
                done()
                return
            return
        (done) ->
            server.request(host: '127.0.0.1:4041').send 'ping', null, null, (err, res) ->
                console.log 'ping res server: ' + res.arg2 + ' ' + res.arg3
                done()
                return
            return
    ], ->
    return
)
server.listen 4040, '127.0.0.1', ready.signal
client.listen 4041, '127.0.0.1', ready.signal
