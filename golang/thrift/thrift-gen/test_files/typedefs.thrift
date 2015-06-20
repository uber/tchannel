
typedef i64 X
typedef X Z

struct S {
  1: X x
  2: Y y
  3: Z z
}

typedef S ST

service Test {
  Y M1(1: X arg1)
  X M2(1: Y arg1)
  Z M3(1: X arg1)
  S M4(1: S arg1)

  // Thrift compiler is broken on this case.
  // ST M5(1: ST arg1, 2: S arg2)
}
