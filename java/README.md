# TChannel for the JVM

A Java implementation of [TChannel](https://github.com/uber/tchannel)

## Stability: Experimental

## Example

```java

TChannel server = new TChannel('server');
server.register(new RawRequestHandler() {
    @Override
    public void onRequest(Stream s, Request req) {
        System.out.println(req);
    }
});
ChannelFuture f = server.listen('127.0.0.1:8888');
f.addListener(ChannelFutureListener.CLOSE_ON_FAILURE)

TChannel client = new TChannel('client');
ChannelFuture response = client.request('127.0.0.1:8888', new RawRequest('func1', 'arg1', 'arg2'));
response.addListeneer(new ChannelFutureListener {
    @Override
    public void operationComplete(ChannelFuture f) {
        System.out.println(f.isSuccess());
    }
});
```
