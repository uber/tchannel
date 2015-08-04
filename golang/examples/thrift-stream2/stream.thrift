struct String {
  1: string s
}
struct StringStream {}

struct SCount {
  1: string s
  2: i32 count
}
struct SCountStream {}


service UniqC {
  SCountStream run(1: StringStream arg)
}
