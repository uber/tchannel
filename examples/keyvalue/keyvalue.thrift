struct GetResult {
    1: string value
}

service KeyValue {
    GetResult get_v1(
        1: string key
    )
    void put_v1(
        1: string key,
        2: string value
    )
}
