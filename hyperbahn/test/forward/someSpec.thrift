struct FooStruct {
    1:i32 bar
    2:string baz
}

struct FooResult {
    1:FooStruct foo
}

service echo {
    FooResult thrift_echo(1:FooStruct foo)
}
