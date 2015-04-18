package thrift

import "testing"
import "fmt"
import "github.com/uber/tchannel/golang/thrift"
import gen "github.com/uber/tchannel/golang/examples/thrift/gen-go/test"
import "errors"

func createClient(serviceName, processorName string, server *thrift.Server, t *testing.T) *gen.TestClient {
	protocol, err := thrift.NewTChannelOutboundProtocol(server.HostPort(), serviceName, processorName)
	if err != nil {
		t.Fatal("Failed to create client")
	}
	return gen.NewTestClientProtocol(nil, protocol, protocol)
}

func createGoodClient(server *thrift.Server, t *testing.T) *gen.TestClient {
	return createClient("MyThriftService", "MyThriftProcessor", server, t)
}

func createBadClient(server *thrift.Server, t *testing.T) *gen.TestClient {
	return createClient("MyThriftService", "SomeRandomProcessor", server, t)
}

func TestEcho(t *testing.T) {
	withTestServer(t, func(server *thrift.Server) {
		client := createGoodClient(server, t)
		for i := 0; i < 3; i++ {
			msg := fmt.Sprintf("thrift over tchannel #%d", i)
			if res, err := client.Echo(msg); err != nil {
				t.Fatal("Echo failed", err)
			} else if res != msg {
				t.Errorf("Echo returned unexpected result: %v", res)
			}
		}
	})
}

func TestHealthcheck(t *testing.T) {
	withTestServer(t, func(server *thrift.Server) {
		client := createGoodClient(server, t)
		for i := 0; i < 3; i++ {
			if res, err := client.Healthcheck(); err != nil {
				t.Fatal("Healthcheck failed", err)
			} else if !res.Healthy || res.Msg != "OK" {
				t.Errorf("Healthcheck returned unexpected result: %v", res)
			}
		}
	})
}

func TestAppError(t *testing.T) {
	withTestServer(t, func(server *thrift.Server) {
		client := createGoodClient(server, t)
		for i := 0; i < 3; i++ {
			if err := client.AppError(); err == nil {
				t.Errorf("AppError should return error but did not")
			}
		}
	})
}

func TestAll(t *testing.T) {
	withTestServer(t, func(server *thrift.Server) {
		client := createGoodClient(server, t)
		for i := 0; i < 3; i++ {
			msg := fmt.Sprintf("thrift over tchannel #%d", i)
			if res, err := client.Echo(msg); err != nil {
				t.Fatal("Echo failed", err)
			} else if res != msg {
				t.Errorf("Echo returned unexpected result: %v", res)
			}

			if res, err := client.Healthcheck(); err != nil {
				t.Fatal("Healthcheck failed", err)
			} else if !res.Healthy || res.Msg != "OK" {
				t.Errorf("Healthcheck returned unexpected result: %v", res)
			}

			if err := client.AppError(); err == nil {
				t.Errorf("AppError should return error but did not")
			}
		}
	})
}

func TestBadClient(t *testing.T) {
	withTestServer(t, func(server *thrift.Server) {
		client := createBadClient(server, t)
		for i := 0; i < 3; i++ {
			msg := fmt.Sprintf("thrift over tchannel #%d", i)
			if _, err := client.Echo(msg); err == nil {
				t.Error("Echo should have failed but did not")
			}

			if _, err := client.Healthcheck(); err == nil {
				t.Error("Healthcheck should have failed but did not")
			}

			if err := client.AppError(); err == nil {
				t.Errorf("AppError should have failed but did not")
			}
		}
	})
}

func withTestServer(t *testing.T, f func(s *thrift.Server)) {
	server, err := thrift.NewServer(":0", "MyThriftService")
	if err != nil {
		t.Fatal("Failed to create server", err)
	}

	server.Register("MyThriftProcessor", gen.NewTestProcessor(&TestHandler{}))
	go server.ListenAndServe()
	func() {
		defer server.Stop()
		f(server)
	}()
}

type TestHandler struct {
}

func (h *TestHandler) Healthcheck() (*gen.HealthCheckRes, error) {
	return &gen.HealthCheckRes{true, "OK"}, nil
}

func (h *TestHandler) Echo(msg string) (r string, err error) {
	return msg, nil
}

func (h *TestHandler) AppError() error {
	return errors.New("app error")
}
