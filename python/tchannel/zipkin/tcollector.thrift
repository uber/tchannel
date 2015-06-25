// Copyright 2012 Twitter Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


// One span refers to one RPC call. The `host` field, which is of type
// `Endpoint`, will be the server being hit by the call.

struct Endpoint {
    1: i32 ipv4
    2: i32 port
    3: string serviceName
}

// Regular annotations just associate a timestamp with a string value
struct Annotation {
    // Timestamp is in milliseconds since epoch. This is converted to
    // microseconds since epoch in the query service since that's what the
    // web frontend expects.
    1: double timestamp
    2: string value                  // what happened at the timestamp?
    3: optional i32 duration         // how long did the operation take in ms
}

enum AnnotationType { BOOL, BYTES, I16, I32, I64, DOUBLE, STRING }

// Binary annotations associate a string key with a value of a particular
// type
struct BinaryAnnotation {
    1: string key
    2: optional string stringValue
    3: optional double doubleValue
    4: optional bool boolValue
    5: optional binary bytesValue
    6: optional i64 intValue
    7: AnnotationType annotationType
}

struct Span {
    1: binary traceId           // unique trace id, use for all spans in trace
    2: Endpoint host            // host being remotely procedure called
    3: string name              // span name, rpc method for example
    4: binary id                // unique span id, only used for this span
    5: binary parentId          // parent span id, 0 if no parent
    6: list<Annotation> annotations
    7: list<BinaryAnnotation> binaryAnnotations
    8: optional bool debug = 0
}

struct Response {
    1: bool ok
}

service TCollector {
    Response submit(1: Span span)
}
