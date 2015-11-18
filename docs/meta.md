
# TChannel Service

Client libraries should register a default service that will be provide meta
information about the client library and internal state. This default service
should be registered under as "tchannel" which can be used without knowing
the service name of the application hosting the endpoint.

The Thrift schema for this service is specified in [meta.thrift](../thrift/meta./thrift).
