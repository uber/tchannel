# Migration

# Upgrading from 1.x to 2.x

## .send() -> .request().send()

Before:
```
chan
    .send(options, a1, a2, a3, cb);
```

After (simple):
```
chan
    .request(options)
    .send(a1, a2, a3, cb);
```

After (if needed/useful):
```
chan
    .request(options)
    .on('error', function onError(err) {
        console.error('too bad:', err);
    })
    .on('response', function onResponse(res) {
        console.log('got:', res.arg2, res.arg3);
    })
    .send(a1, a2, a3);
```
