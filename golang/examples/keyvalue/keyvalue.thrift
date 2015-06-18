service KeyValue {
  string Get(1: string key)
  void Set(1: string key, 2: string value)
}
