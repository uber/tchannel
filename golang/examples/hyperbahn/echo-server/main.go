package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"time"

	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/hyperbahn"
	"golang.org/x/net/context"
)

func main() {
	tchan, err := tchannel.NewChannel("go-echo-server", nil)
	if err != nil {
		log.Fatalf("Failed to create channel: %v", err)
	}

	l, err := net.Listen("tcp", ":61543")
	if err != nil {
		log.Fatalf("Could not listen: %v", err)
	}
	log.Printf("Listening on %v", l.Addr())

	tchan.Register(handler{}, "echo")
	tchan.Serve(l)

	// register service with Hyperbahn.
	client := hyperbahn.NewClient(tchan, os.Args[1:], &hyperbahn.ClientOptions{
		Handler: eventHandler{},
		Timeout: time.Second,
	})
	if err := client.Register(); err != nil {
		fmt.Println("Register threw error:", err)
	}

	// Server will keep running till Ctrl-C.
	select {}
}

type eventHandler struct{}

func (eventHandler) On(event hyperbahn.Event) {
	fmt.Printf("On(%v)\n", event)
}

func (eventHandler) OnError(err error) {
	fmt.Printf("OnError(%v)\n", err)
}

type handler struct{}

func (handler) Handle(ctx context.Context, call *tchannel.InboundCall) {
	var arg2 []byte
	if err := tchannel.NewArgReader(call.Arg2Reader()).Read(&arg2); err != nil {
		log.Printf("Read arg2 failed: %v\n", err)
	}

	var arg3 []byte
	if err := tchannel.NewArgReader(call.Arg3Reader()).Read(&arg3); err != nil {
		log.Printf("Read arg2 failed: %v\n", err)
	}

	resp := call.Response()
	if err := tchannel.NewArgWriter(resp.Arg2Writer()).Write(arg2); err != nil {
		log.Printf("Write arg2 failed: %v", arg2)
	}

	if err := tchannel.NewArgWriter(resp.Arg3Writer()).Write(arg3); err != nil {
		log.Printf("Write arg3 failed: %v", arg3)
	}

}
