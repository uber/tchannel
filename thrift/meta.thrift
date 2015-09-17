struct HealthStatus {
    1: required bool ok
    2: optional string message
}

struct ThriftIDLs {
    // map: filename -> contents
    1: required map<string, string> idls 
}

service Meta {
    HealthStatus health()
    ThriftIDLs thriftIDL()
}