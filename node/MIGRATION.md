# Migration

# Upgrading from 1.x to 2.x

## .send() -> .request().send()

Before:
```
chan
    .send(options, a1, a2, a3, cb);
```

After:
```
chan
    .request(options, cb)
    .send(a1, a2, a3);
```
