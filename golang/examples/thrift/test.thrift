struct HealthCheckRes {
  1: bool healthy,
  2: string msg,
}

service First {
    string Echo(1:string msg)
    HealthCheckRes Healthcheck()
    void AppError()
    oneway void OneWay()
}

service Second {
    void Test()
}
