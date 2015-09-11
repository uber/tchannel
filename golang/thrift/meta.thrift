struct HealthStatus {
    1: required bool ok
    2: optional string message
}

service Meta {
    HealthStatus health()
}
