package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"time"

	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/examples/thrift-stream2/gen-go/stream"
	"github.com/uber/tchannel/golang/thrift"
)

var (
	chOptions   = &tchannel.ChannelOptions{}
	hostPort    = flag.String("hostPort", "127.0.0.1:12345", "Host:Port of the server")
	startServer = flag.Bool("server", false, "Whether to start the server")
	startClient = flag.Bool("client", false, "Whether to start the client")
)

func main() {
	flag.Parse()
	if !*startServer && !*startClient {
		log.Fatalf("at least one of --server or --client must be specified")
	}

	ch, err := tchannel.NewChannel("uniq", chOptions)
	if err != nil {
		log.Fatalf("NewChannel failed: %v", err)
	}

	if *startServer {
		svr := thrift.NewServer(ch)
		svr.RegisterStreaming(stream.NewSTChanUniqCServer(handler{}, thrift.NewClient(ch, "uniq", nil)))

		if err := ch.ListenAndServe(*hostPort); err != nil {
			log.Fatalf("ListenAndServe failed: %v", err)
		}
		log.Printf("server: listening on %v", ch.PeerInfo().HostPort)
	}

	if *startClient {
		if err := runClient(*hostPort); err != nil {
			log.Fatalf("runClient failed: %v", err)
		}
	}

	select {}
}

func runClient(hostPort string) error {
	ch, err := tchannel.NewChannel("uniq-client", chOptions)
	if err != nil {
		return err
	}

	ch.Peers().Add(hostPort)

	tClient := thrift.NewClient(ch, "uniq", nil)
	client := stream.NewSTChanUniqCClient(tClient)

	ctx, cancel := thrift.NewContext(1000 * time.Second)
	defer cancel()

	call, err := client.Run(ctx)
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
			log.Printf("\nclient: got result %v\n", res)
		}
	}()

	rdr := bufio.NewReader(os.Stdin)
	for {
		str, err := rdr.ReadString('\n')
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Fatalf("client: ReadString failed: %v", err)
		}

		if err := call.Write(&stream.String{str}); err != nil {
			log.Fatalf("client: Write failed: %v", err)
		}
		if err := call.Flush(); err != nil {
			log.Fatalf("client: Flush failed: %v", err)
		}
	}

	return call.Done()
}

type handler struct{}

func (handler) Run(ctx thrift.Context, call *stream.RunInCall) error {
	var lastStr string
	counter := int32(0)
	for {
		s, err := call.Read()
		if err == io.EOF {
			// Flush out the last count.

			log.Printf("server: arguments done")
			break
		}
		if err != nil {
			log.Fatalf("server: got err %v", err)
			break
		}

		if counter == 0 {
			lastStr = s.S
		}
		if lastStr == s.S || counter == 0 {
			counter++
			continue
		}

		// Flush out the current result.
		if err := call.Write(&stream.SCount{S: lastStr, Count: counter}); err != nil {
			log.Fatalf("server: Write got err: %v", err)
		}
		if err := call.Flush(); err != nil {
			log.Fatalf("server: Flush got err: %v", err)
		}

		// Reset the state
		counter = 1
		lastStr = s.S
	}

	return call.Done()
}
