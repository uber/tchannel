struct HealthCheckRes {
  1: bool healthy,
  2: string msg,
}

service Test {
    string Echo(1:string msg)
    HealthCheckRes Healthcheck()
    void AppError()
}