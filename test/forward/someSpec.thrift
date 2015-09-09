struct FooStruct {
    1: required i32 bar
    2: required string baz
}

struct FooResult {
    1: required FooStruct foo
}

service echo {
    FooResult thrift_echo(1:FooStruct foo)
}
