service baseService {
  string HealthCheck()
}

exception KeyNotFound {
  1: string key
}

service KeyValue extends baseService {
  string Get(1: string key) throws (1: KeyNotFound notFound)
  void Set(1: string key, 2: string value)
}

# Returned when calling the Admin service.
exception NotAuthorized {}

service Admin extends baseService {
  void clearAll() throws (1: NotAuthorized notAuthorized)
}
