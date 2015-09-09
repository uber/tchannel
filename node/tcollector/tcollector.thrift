// One span refers to one RPC call. The `host` field, which is of type
// `Endpoint`, will be the server being hit by the call.

struct Endpoint {
    1: required i32 ipv4
    2: required i32 port
    3: required string serviceName
}

// Regular annotations just associate a timestamp with a string value
struct Annotation {
    // Timestamp is in milliseconds since epoch. This is converted to
    // microseconds since epoch in the query service since that's what the
    // web frontend expects.
    1: required double timestamp
    2: required string value                  // what happened at the timestamp?
    3: optional i32 duration         // how long did the operation take in ms
}

enum AnnotationType { BOOL, BYTES, I16, I32, I64, DOUBLE, STRING }

// Binary annotations associate a string key with a value of a particular
// type
struct BinaryAnnotation {
    1: required string key
    2: optional string stringValue
    3: optional double doubleValue
    4: optional bool boolValue
    5: optional binary bytesValue
    6: optional i64 intValue
    7: required AnnotationType annotationType
}

struct Span {
    1: required binary traceId           // unique trace id, use for all spans in trace
    2: required Endpoint host            // host being remotely procedure called
    3: required string name              // span name, rpc method for example
    4: required binary id                // unique span id, only used for this span
    5: required binary parentId          // parent span id, 0 if no parent
    6: required list<Annotation> annotations
    7: required list<BinaryAnnotation> binaryAnnotations
    8: optional bool debug = 0
}

struct Response {
    1: required bool ok
}

service TCollector {
    Response submit(1: Span span)
}
