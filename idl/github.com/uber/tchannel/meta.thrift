enum State {
    REFUSING = 0,
    ACCEPTING = 1,
    STOPPING = 2,
    STOPPED = 3,
}

enum RequestType {
    LEGACY = 0,
    TRAFFIC = 1,
}

struct HealthRequest {
    1: optional RequestType type
}

struct HealthStatus {
    1: required bool ok
    2: optional string message
    3: optional State state
}

typedef string filename

struct ThriftIDLs {
    // map: filename -> contents
    1: required map<filename, string> idls
    // the entry IDL that imports others
    2: required filename entryPoint
}

struct VersionInfo {
  // short string naming the implementation language
  1: required string language
  // language-specific version string representing runtime or build chain
  2: required string language_version
  // semver version indicating the version of the tchannel library
  3: required string version
}

service Meta {
    HealthStatus health(1: HealthRequest hr)
    ThriftIDLs thriftIDL()
    VersionInfo versionInfo()
}
