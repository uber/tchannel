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
server = new TChannel(handler: EndpointHandler())
client = new TChannel
# normal response
server.handler.register 'func1', (req, res) ->
    console.log 'func1 responding with a small delay:' + req.arg2.toString() + ' 2:' + req.arg3.toString()
    setTimeout (->
        res.sendOk 'result', 'indeed it did'
        return
    ), Math.random() * 1000
    return
# err response
server.handler.register 'func2', (req, res) ->
    res.sendNotOk null, 'it failed'
    return
ready = CountedReadySignal(2)
listening = ready((err) ->
    if err
        throw err
    client.request(host: '127.0.0.1:4040').send 'func1', 'arg 1', 'arg 2', (err, res) ->
        console.log 'normal res: ' + res.arg2.toString() + ' ' + res.arg3.toString()
        return
    client.request(host: '127.0.0.1:4040').send 'func2', 'arg 1', 'arg 2', (err, res) ->
        console.log 'err res: ' + res.ok + ' message: ' + String(res.arg3)
        return
    return
)
server.listen 4040, '127.0.0.1', ready.signal
client.listen 4041, '127.0.0.1', ready.signal
