struct HealthStatus {
    1: required bool ok
    2: optional string message
}

typedef string filename

struct ThriftIDLs {
    // map: filename -> contents
    1: required map<filename, string> idls
    // the entry IDL that imports others
    2: required filename entryPoint
}

service Meta {
    HealthStatus health()
    ThriftIDLs thriftIDL()
}