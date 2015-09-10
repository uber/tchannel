struct DiscoveryQuery {
    1: required string serviceName
}

union IpAddress {
  1: i32 ipv4
}

struct ServicePeer {
  1: required IpAddress ip
  2: required i32 port
}

struct DiscoveryResult {
  1: required list<ServicePeer> peers
}

service Hyperbahn {
    DiscoveryResult discover(
        1: required DiscoveryQuery query
    )
}