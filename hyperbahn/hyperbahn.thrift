exception Exception {
    1: required string message
}

exception NoHost {
    1: required string message
}

service Hyperbahn {
    list<string> hostportsByService(
        1: required string serviceName
    ) throws (
        1: Exception error
        2: NoHost noHost
    )
}