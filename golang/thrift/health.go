package thrift

import "github.com/uber/tchannel/golang/thrift/gen-go/meta"

// HealthFunc is function interface for health check endpoint.
// Customized health endpoint has to follow this interface.
type HealthFunc func(ctx Context) (*meta.HealthStatus, error)

// HealthHandler implements the default health check enpoint.
type HealthHandler struct {
	handler HealthFunc
}

// NewHealthHandler return a new HealthHandler instance.
func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

// Health returns true as default Health endpoint.
func (h *HealthHandler) Health(ctx Context) (r *meta.HealthStatus, err error) {
	if h.handler != nil {
		return h.handler(ctx)
	}
	return &meta.HealthStatus{Ok: true}, nil
}

// SetHandler sets customized handler for health endpoint.
func (h *HealthHandler) SetHandler(f HealthFunc) {
	h.handler = f
}
