package thrift

import "testing"
import "fmt"
import appachethrift "github.com/apache/thrift/lib/go/thrift"
import "github.com/uber/tchannel/golang/thrift"
import gen "github.com/uber/tchannel/golang/examples/thrift/gen-go/test"
import "errors"
import "reflect"
import "golang.org/x/net/context"
import "time"
import tchannel "github.com/uber/tchannel/golang"

func TestEcho(t *testing.T) {
	withTestServersAndClients(t, func(server *thrift.Server, client *gen.FirstClient) {
		testEcho(server, client, t)
	})
}

func testEcho(server *thrift.Server, client *gen.FirstClient, t *testing.T) {
	for i := 0; i < 3; i++ {
		msg := fmt.Sprintf("thrift over tchannel #%d", i)
		if res, err := client.Echo(msg); err != nil {
			t.Fatal("Echo failed", err)
		} else if res != msg {
			t.Errorf("Echo returned unexpected result: %v", res)
		}
	}
}

func TestHealthcheck(t *testing.T) {
	withTestServersAndClients(t, func(server *thrift.Server, client *gen.FirstClient) {
		testHealthcheck(server, client, t)
	})
}

func testHealthcheck(server *thrift.Server, client *gen.FirstClient, t *testing.T) {
	for i := 0; i < 3; i++ {
		if res, err := client.Healthcheck(); err != nil {
			t.Fatal("Healthcheck failed", err)
		} else if !res.Healthy || res.Msg != "OK" {
			t.Errorf("Healthcheck returned unexpected result: %v", res)
		}
	}
}

func TestAppError(t *testing.T) {
	withTestServersAndClients(t, func(server *thrift.Server, client *gen.FirstClient) {
		testAppError(server, client, t)
	})
}

func testAppError(server *thrift.Server, client *gen.FirstClient, t *testing.T) {
	for i := 0; i < 3; i++ {
		if err := client.AppError(); err == nil {
			t.Errorf("AppError should return error but did not")
		}
	}
}

func TestOneWay(t *testing.T) {
	withTestServersAndClients(t, func(server *thrift.Server, client *gen.FirstClient) {
		testOneWay(server, client, t)
	})
}

func testOneWay(server *thrift.Server, client *gen.FirstClient, t *testing.T) {
	for i := 0; i < 3; i++ {
		if err := client.OneWay(); err != nil {
			t.Fatal("OneWay failed", err)
		}
	}
}

func TestAll(t *testing.T) {
	withTestServersAndClients(t, func(server *thrift.Server, client *gen.FirstClient) {
		testAll(server, client, t)
	})
}

func testAll(server *thrift.Server, firstClient *gen.FirstClient, t *testing.T) {
	secondClient := newSecondClient(server, t)
	for i := 0; i < 3; i++ {
		msg := fmt.Sprintf("thrift over tchannel #%d", i)
		if res, err := firstClient.Echo(msg); err != nil {
			t.Fatal("Echo failed", err)
		} else if res != msg {
			t.Errorf("Echo returned unexpected result: %v", res)
		}

		if res, err := firstClient.Healthcheck(); err != nil {
			t.Fatal("Healthcheck failed", err)
		} else if !res.Healthy || res.Msg != "OK" {
			t.Errorf("Healthcheck returned unexpected result: %v", res)
		}

		if err := firstClient.AppError(); err == nil {
			t.Errorf("AppError should return error but did not")
		}

		if err := firstClient.OneWay(); err != nil {
			t.Fatal("OneWay failed", err)
		}

		if err := secondClient.Test(); err != nil {
			t.Fatal("Test failed", err)
		}
	}
}

func TestBadClient(t *testing.T) {
	withTestServer(t, true, func(server *thrift.Server) {
		testBadClient(server, t)
	})
	withTestServer(t, false, func(server *thrift.Server) {
		testBadClient(server, t)
	})
}

func testBadClient(server *thrift.Server, t *testing.T) {
	client := newBadClient(server, t)
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
}

func withTestServer(t *testing.T, buffered bool, f func(s *thrift.Server)) {
	server, err := thrift.NewServer(":0", "MyThriftService", thrift.ServerOptions{Buffered: buffered})
	if err != nil {
		t.Fatal("Failed to create server", err)
	}

	firstHandler := FirstHandler{}
	server.Register("FirstProcessor", reflect.TypeOf(&firstHandler), gen.NewFirstProcessor(&firstHandler))
	secondHandler := SecondHandler{}
	server.Register("SecondProcessor", reflect.TypeOf(&secondHandler), gen.NewSecondProcessor(&secondHandler))
	go server.ListenAndServe()

	defer server.Stop()
	f(server)
}

func withTestServerAndClient(t *testing.T, bufferedServer, bufferedClient bool,
	f func(s *thrift.Server, c *gen.FirstClient)) {

	withTestServer(t, bufferedServer, func(server *thrift.Server) {
		client := newFirstClient(server, bufferedClient, t)
		f(server, client)
	})
}

func withTestServersAndClients(t *testing.T, f func(s *thrift.Server, c *gen.FirstClient)) {
	for _, bufferedServer := range []bool{true, false} {
		for _, bufferedClient := range []bool{true, false} {
			withTestServerAndClient(t, bufferedServer, bufferedClient, f)
		}
	}
}

func newFirstClient(server *thrift.Server, buffered bool, t *testing.T) *gen.FirstClient {
	channel, err := tchannel.NewChannel(":0", nil)
	if err != nil {
		t.Fatal("Failed to create tchannel")
	}
	timeout := time.Second * time.Duration(1) // per-call timeout
	var protocol appachethrift.TProtocol
	if buffered {
		protocol, err = thrift.NewTChannelOutboundProtocol(context.Background(), channel,
			server.HostPort(), "MyThriftService", "FirstProcessor",
			thrift.OutboundOptions{Timeout: &timeout})
	} else {
		protocol, err = thrift.NewTChannelOutboundProtocolStreamed(context.Background(), channel,
			server.HostPort(), "MyThriftService", "FirstProcessor",
			thrift.OutboundOptions{Timeout: &timeout})
	}
	if err != nil {
		t.Fatal("Failed to create client")
	}
	return gen.NewFirstClientProtocol(nil, protocol, protocol)
}

func newSecondClient(server *thrift.Server, t *testing.T) *gen.SecondClient {
	channel, err := tchannel.NewChannel(":0", nil)
	if err != nil {
		t.Fatal("Failed to create tchannel")
	}
	timeout := time.Second * time.Duration(2) // overall timeout
	ctx, _ := context.WithTimeout(context.Background(), timeout)
	protocol, err := thrift.NewTChannelOutboundProtocolStreamed(ctx, channel,
		server.HostPort(), "MyThriftService", "SecondProcessor",
		thrift.OutboundOptions{})
	if err != nil {
		t.Fatal("Failed to create client")
	}
	return gen.NewSecondClientProtocol(nil, protocol, protocol)
}

func newBadClient(server *thrift.Server, t *testing.T) *gen.FirstClient {
	channel, err := tchannel.NewChannel(":0", nil)
	if err != nil {
		t.Fatal("Failed to create tchannel")
	}
	timeout := time.Second * time.Duration(1)
	protocol, err := thrift.NewTChannelOutboundProtocolStreamed(context.Background(), channel,
		server.HostPort(), "MyThriftService", "ThirdProcessor",
		thrift.OutboundOptions{Timeout: &timeout})
	if err != nil {
		t.Fatal("Failed to create client")
	}
	return gen.NewFirstClientProtocol(nil, protocol, protocol)
}

type FirstHandler struct {
}

func (h *FirstHandler) Healthcheck() (*gen.HealthCheckRes, error) {
	return &gen.HealthCheckRes{true, "OK"}, nil
}

func (h *FirstHandler) Echo(msg string) (r string, err error) {
	return msg, nil
}

func (h *FirstHandler) AppError() error {
	return errors.New("app error")
}

func (h *FirstHandler) OneWay() error {
	return errors.New("OneWay error...won't be seen by client")
}

type SecondHandler struct {
}

func (h *SecondHandler) Test() error {
	return nil
}
