package main

import (
	"time"
	"github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
	"fmt"
	"os"
	// log "github.com/Sirupsen/logrus"
)

type Headers map[string]string

type Ping struct {
	Message string `json:"message"`
}

type Pong Ping

func pingHandler(ctx context.Context, call *tchannel.InboundCall) {
	var headers Headers

	var inArg2 tchannel.BytesInput
	if err := call.ReadArg2(&inArg2); err != nil {
		fmt.Printf("Could not read headers from client: %v", err)
		return
	}

	var inArg3 tchannel.BytesInput
	if err := call.ReadArg3(&inArg3); err != nil {
		fmt.Printf("Could not read body from client: %v", err)
		return
	}

	if err := call.Response().WriteArg2(tchannel.NewJSONOutput(headers)); err != nil {
		fmt.Printf("Could not echo response headers to client: %v", err)
		return
	}

	pong := Pong{Message: fmt.Sprintf("ping %s", inArg3)}
	if err := call.Response().WriteArg3(tchannel.NewJSONOutput(pong)); err != nil {
		fmt.Printf("Could not write response body to client: %v", err)
		return
	}
}

func listenAndHandle(s *tchannel.Channel, hostPort string) {
	fmt.Println("Serving ", hostPort)
	err := s.ListenAndServe(hostPort) // If no error is returned, this blocks forever
	if err != nil {
		fmt.Println(err)
		os.Exit(-1)
	}
}

func main() {
	// Create a new TChannel for handling requests
	ch, err := tchannel.NewChannel(nil)
	if err != nil {
		fmt.Println(err)
		return
	}

	// Register a handler for the ping message on the PingService
	ch.Register(tchannel.HandlerFunc(pingHandler), "PingService", "ping")

	// Listen for incoming requests
	// ch.ListenAndServe("127.0.0.1:10500")
	go listenAndHandle(ch, "127.0.0.1:10500")

	// Create a new TChannel for sending requests.
	client, err := tchannel.NewChannel(nil)
	if err != nil {
		fmt.Println(err)
	}

	// go listenAndHandle(client, "localhost:10500")
	// Make a call to ourselves, with a timeout of 10s
	ctx, cancel := context.WithTimeout(context.Background(), time.Second * 10)
	defer cancel()

	var responseHeaders Headers
	ping := Ping{"Hello, World!"}
	var pong Pong

	// RoundTrip returns bool, error.  The bool here is false.  Not sure why.
	_, err = client.RoundTrip(ctx, "localhost:10500", "PingService", "ping",
		tchannel.NewJSONOutput(Headers{}),  tchannel.NewJSONOutput(ping),
		tchannel.NewJSONInput(&responseHeaders), tchannel.NewJSONInput(&pong))
	if err != nil {
		fmt.Println(err)
		return
	}

	fmt.Println("Received pong:", pong.Message)
}
