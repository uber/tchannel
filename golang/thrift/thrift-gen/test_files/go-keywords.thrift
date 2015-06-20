// Test to make sure that reserved names are handled correctly.
service func {
  string func1()
  void func(1: i32 func)
}
