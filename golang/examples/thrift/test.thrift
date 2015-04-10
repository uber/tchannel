struct HealthCheckRes {
  1: bool healthy,
  2: string msg,
}

service Test {
    string echo(1:string msg)
    HealthCheckRes healthcheck()
    void appError()
}