# TChannel for the JVM

A Java implementation of [TChannel](https://github.com/uber/tchannel).

## Stability: *Experimental*

## Completed
- Frame codecs
- Message codecs
- Checksumming
- Message Multiplexing a.k.a. fragment aggregation

## In Progress
- Tracing

## TODO
- Final API design and implementation
- Message Canceling
- Message Claiming
- Handling Errors properly
- Performance

## *Proposed* Example Usage

```java
TChannel server = new TChannel('server');
server.register('noop', new RawRequestHandler() {
    @Override
    public void onRequest(Stream s, Request req) {
        System.out.println(req);
    }
});
ChannelFuture f = server.listen('127.0.0.1:8888');
f.addListener(ChannelFutureListener.CLOSE_ON_FAILURE)

TChannel client = new TChannel('client');
ChannelFuture response = client.request('127.0.0.1:8888', 'noop', new RawRequest('func1', 'arg1', 'arg2'));
response.addListener(new ChannelFutureListener {
    @Override
    public void operationComplete(ChannelFuture f) {
        System.out.println(f.isSuccess());
    }
});
```
