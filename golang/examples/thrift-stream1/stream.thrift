struct SString {
  1: string f1
}


// This is a hack to tell our compiler that this is a stream.
// typedef SString SStringStream
// Above isn't supported by thrift, hack:
struct SStringStream {}

service TestStream {
  /*ResType ReqStream(1: ArgTypeStream req)
  ResTypeStream ResStream(1: ArgType req)
  ResTypeStream BothStream(1: ArgTypeStream req)
  // i32 Normal(1: i32 arg1)
  // Still use it the same way?
  void NoRetStream(1: SStringStream arg1)
*/
  SStringStream BothStream(1: SStringStream arg1)


}
