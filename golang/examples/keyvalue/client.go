package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"golang.org/x/net/context"

	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/examples/keyvalue/gen-go/keyvalue"
	"github.com/uber/tchannel/golang/hyperbahn"
	"github.com/uber/tchannel/golang/thrift"
)

func printHelp() {
	fmt.Printf("Usage:\n get [key]\n set [key] [value]\n")
}

func main() {
	// Create a TChannel.
	ch, err := tchannel.NewChannel("keyvalue-client", nil)
	if err != nil {
		log.Fatalf("Failed to create tchannel: %v", err)
	}

	// Set up Hyperbahn client.
	nodes := os.Args[1:]
	if len(nodes) == 0 {
		log.Fatalf("No Autobahn nodes to register to given")
	}
	hyperbahn.NewClient(ch, nodes, nil)

	// Read commands from the command line and execute them.
	scanner := bufio.NewScanner(os.Stdin)
	printHelp()
	fmt.Printf("> ")
	for scanner.Scan() {
		parts := strings.Split(scanner.Text(), " ")
		if parts[0] == "" {
			continue
		}
		switch parts[0] {
		case "help":
			printHelp()
		case "get":
			if len(parts) < 2 {
				printHelp()
				break
			}
			get(ch, parts[1])
		case "set":
			if len(parts) < 3 {
				printHelp()
				break
			}
			set(ch, parts[1], parts[2])
		default:
			log.Printf("Unsupported command %q\n", parts[0])
		}
		fmt.Print("> ")
	}
	scanner.Text()
}

func getClient(ch *tchannel.Channel) *keyvalue.KeyValueClient {
	ctx, _ := context.WithTimeout(context.Background(), time.Second*10)

	ctx = tchannel.NewRootContext(ctx)
	protocol := thrift.NewTChanOutbound(ch, thrift.TChanOutboundOptions{
		Context:          ctx,
		HyperbahnService: "keyvalue",
		ThriftService:    "KeyValue",
	})
	client := keyvalue.NewKeyValueClientProtocol(nil, protocol, protocol)
	return client
}

func get(ch *tchannel.Channel, key string) {
	client := getClient(ch)
	val, err := client.Get(key)
	if err != nil {
		log.Printf("Get %v got err: %v", key, err)
		return
	}

	log.Printf("Get %v: %v", key, val)
}

func set(ch *tchannel.Channel, key, value string) {
	client := getClient(ch)
	if err := client.Set(key, value); err != nil {
		log.Printf("Set %v:%v got err: %v", key, value, err)
	}
	log.Printf("Set %v:%v succeeded", key, value)
}
