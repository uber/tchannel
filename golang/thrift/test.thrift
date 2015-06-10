struct Data {
  1: bool b1,
  2: string s2,
  3: i32 i3
}

service SimpleService {
  Data Call(1: Data arg)
  void Simple()
  oneway void OneWay()
}

service SecondService {
  string Echo(1: string arg)
}
