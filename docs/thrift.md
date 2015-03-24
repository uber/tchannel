Thrift over TChannel
====================

This document outlines how we intend to use Thrift over TChannel.

For Thrift requests sent over TChannel, the `as` (arg scheme) transport header
must be set to `thrift`. Requests will be made using `call req` messages and
responses will be sent using `call res` messages, with values for `arg{1,2,3}`
as defined in [Arguments][].

For `call res`,

-   In case of success, the Response Code (`code:1`) must be set to `0x00`.
-   In case of failure, the Response Code (`code:1`) must be set to `0x01`.

Arguments
---------

For both, `call req` and `call res`,

-   `arg1` must be the method name as defined by [`arg1`][]
-   `arg2` must be the application headers in the format `nh:2 (k~2 v~2){nh}`
-   `arg3` must be the Thrift payload as defined by [`arg3`][]

### `arg1`

This must be a concatenation of the Thrift service name and the service method
name separated by two colons (`::`). This is the same name that will be used to
refer to the endpoint on the server-side.

For example, `arg1` will be `PingService::ping` for the following service's
`ping` method.

```thrift
service PingService {
    void ping()
}
```

Note that the Thrift service name is not necessarily the same as the TChannel
service name. That is, the value for `service~1` in the `call req/res` may be
different from the service name used in the Thrift IDL (and so, the endpoint
name).

### `arg3`

`arg3` must contain a Thrift struct encoded using `TBinaryProtocol`.

For `call req` messages, it is a struct containing JUST the parameters of the
method.

For `call res` messages,

-   In case of success, the response contains a struct with a single field with
    identifier `0` that contains the return value of the method. For methods
    with a `void` return type, the struct must be empty.

-   In case of failure, the response contains a struct with a single exception
    field identifier with the exception struct as the value.

For example,

```thrift
service CommentService {
    list<Comment> getComments(
        1: EntityId id
        2: i32 offset
        3: i32 limit
    ) throws (
        1: InvalidParametersException invalidParameters
        2: EntityDoesNotExist doesNotExist
    )
}
```

For `getComments(1234, 10, 100)`, the `arg3` for `call req` will contain the
binary-encoded version of the following struct:

```
{
    1: 1234,
    2: 10,
    3: 100
}
```

If the call succeeds, the `call res` body contains the following binary-encoded
struct:

```
{
    0: [
        { /* comment fields go here */ },
        { /* comment fields go here */ },
        // ...
    ]
}
```

If the call fails with an `EntityDoesNotExist` exception, the body contains the
following binary-encoded struct:

```
{
    2: { /* EntityDoesNotExist fields go here */ }
}
```

Multiple Services
-----------------

To avoid confusion, these definitions will be used in this section:

-   **Service** refers to individual `service`s defined in the Thrift IDL.
-   **System** refers to the whole system being designed in the Thrift IDL. A
    system may consist of multiple services.

A Thrift IDL for a system may contain multiple Thrift services that partition
the different concerns of the system. For example,

```thrift
service UserService {
    UserId createUser(1: UserDetails details)
    void verifyEmailAddress(1: UserId userId, 2: VerificationToken token)
}

service PostService {
    PostId submitPost(1: UserId userId, 2: PostInfo post)
}
```

There are two ways to consume such a multi-service system:

-   Set up a separate server on a different port and/or a different machine for
    each service in the system. Consumers specify the different hosts/ports
    while constructing their clients.
-   Multiplex the different services behind the same server.

I'll focus on the second approach in this section because the first approach is
not very different from having separate systems for each service.

As mentioned in [`arg1`][], each service method will be registered with the
TChannel server in the format `{serviceName}::{methodName}`. For the example
above, we'll have 3 endpoints: `UserService::createUser`,
`UserService::verifyEmailAddress`, and `PostService::submitPost`.

Callers must use the full endpoint name when making requests. For example,

```javascript
send({
    service: "UserService",   // < This is the TChannel service name
    endpoint: "PostService::submitPost",
    // ...
})
```

For convenience, client implementations may allow omission of the
`{serviceName}::` prefix for the common case where the TChannel service name
matches the Thrift service name. For example,

```javascript
send({service: "UserService", endpoint: "createUser"})
// The implementation should translate this to,
send({service: "UserService", endpoint: "UserService::createUser"})
```

Service Inheritance
-------------------

Thrift supports the concept of service inheritance. For example,

```thrift
service BaseService {
    bool isHealthy()
}

service UserService extends BaseService {
    // ...
}

service PostService extends BaseService {
    // ...
}
```

In case of service inheritance, we don't want the "parent" service's methods to
be registered under its name. In the example above, we *don't* want
`BaseService::isHealthy` registered. Instead, `UserService::isHealthy` and
`PostService::isHealthy` must be registered.

To do this, the server code responsible for registering endpoints must first
denormalize the Thrift file into a set of "leaf" services that contain all
methods -- including inherited ones.

Uncaught Exceptions
-------------------

For uncaught server-side exceptions that are not defined in the Thrift IDL,
server implementations should attempt to respond with a TChannel `error`
message with error code (`code:1`) `0x05` (unexpected error).

  [Arguments]: #arguments
  [`arg1`]: #arg1
  [`arg3`]: #arg3

