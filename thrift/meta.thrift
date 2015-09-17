struct HealthStatus {
    1: required bool ok
    2: optional string message
}

struct ThriftIDLs {
    // map: filename -> contents
    1: required map<string, string> idls
    // the entry IDL that imports others
    2: required string entryPoint
}

service Meta {
    HealthStatus health()
    ThriftIDLs thriftIDL()
}