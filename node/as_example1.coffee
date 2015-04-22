NullLogtron = require('null-logtron')
TChannelJSON = require('../as/json')
TChannel = require('../')
server = TChannel(
    serviceName: 'server'
    logger: NullLogtron())
client = TChannel(logger: NullLogtron())
tchannelJSON = TChannelJSON(logger: NullLogtron())
context = {}

echo = (context, req, head, body, callback) ->
    callback null,
        ok: true
        head: head
        body: body
    return

onListening = ->

    onResponse = (err, resp) ->
        if err
            console.log 'got error', err
        else
            console.log 'got resp', resp
        server.close()
        return

    tchannelJSON.send client.request(
        serviceName: 'server'
        host: '127.0.0.1:4040'), 'echo', { head: 'object' }, { body: 'object' }, onResponse
    return

tchannelJSON.register server, 'echo', context, echo
server.listen 4040, '127.0.0.1', onListening
