package main

import (
	"fmt"
	"io"
	"log"
	"time"

	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/examples/thrift-stream1/gen-go/stream"
	"github.com/uber/tchannel/golang/thrift"
)

var chOptions = &tchannel.ChannelOptions{}

func main() {
	ch, err := tchannel.NewChannel("stream", chOptions)
	if err != nil {
		log.Fatalf("NewChannel failed: %v", err)
	}

	svr := thrift.NewServer(ch)
	svr.RegisterStreaming(stream.NewSTChanTestStreamServer(handler{}, thrift.NewClient(ch, "stream", nil)))

	if err := ch.ListenAndServe(":12345"); err != nil {
		log.Fatalf("ListenAndServe failed: %v", err)
	}

	if err := runClient(ch.PeerInfo().HostPort); err != nil {
		log.Fatalf("runClient failed: %v", err)
	}
}

func runClient(hostPort string) error {
	ch, err := tchannel.NewChannel("stream-client", chOptions)
	if err != nil {
		return err
	}

	ch.Peers().Add(hostPort)

	tClient := thrift.NewClient(ch, "stream", nil)
	client := stream.NewSTChanTestStreamClient(tClient)

	ctx, cancel := thrift.NewContext(10 * time.Second)
	defer cancel()

	call, err := client.BothStream(ctx)
	if err != nil {
		return fmt.Errorf("client.Stream err: %v", err)
	}

	go func() {
		for {
			res, err := call.Read()
			if err == io.EOF {
				log.Printf("client: results done")
			}
			if err != nil {
				log.Fatalf("client: got err %v", err)
			}
			log.Printf("client: got result %v", res)
		}
	}()

	for i := 0; i < 100; i++ {
		sstr := &stream.SString{fmt.Sprintf("streaming arg %v", i)}
		if err := call.Write(sstr); err != nil {
			return fmt.Errorf("write %v failed: %v", i, err)
		}
		if err := call.Flush(); err != nil {
			return fmt.Errorf("flush %v failed: %v", i, err)
		}
		time.Sleep(50 * time.Millisecond)
	}

	return call.Done()
}

type handler struct{}

func (handler) BothStream(ctx thrift.Context, call *stream.BothStreamInCall) error {
	counter := 0

	for {
		counter++
		s, err := call.Read()
		if err == io.EOF {
			log.Printf("server: arguments done")
			break
		}
		if err != nil {
			log.Fatalf("server: got err %v", err)
			break
		}

		log.Printf("server: got %v", s)

		// Write every third response back to the client.
		if counter%3 == 0 {
			if err := call.Write(s); err != nil {
				log.Fatalf("server: Write got err: %v", err)
			}
			if err := call.Flush(); err != nil {
				log.Fatalf("server: Flush got err: %v", err)
			}
		}
	}

	return nil
}
