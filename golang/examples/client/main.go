package main

import (
	"code.google.com/p/getopt"
	"github.com/op/go-logging"
	"github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
	"os"
	"time"
)

var log = logging.MustGetLogger("tchannel.client")

var peerAddr = getopt.StringLong("peer", 'p', "", "Host and port of remote peer")
var serviceName = getopt.StringLong("service", 's', "", "Name of service to invoke")
var operationName = getopt.StringLong("operation", 'o', "", "Name of operation to invoke")
var arg2 = getopt.StringLong("arg2", '2', "", "Input for arg2.  Curl-style, use @foo.txt to read from foo.txt")
var arg3 = getopt.StringLong("arg3", '3', "", "Input for arg3.  Curl-style, use @foo.txt to read from foo.txt")
var timeout = getopt.IntLong("timeout", 't', 30, "Timeout (in seconds)")

func asArgument(arg string) tchannel.Output {
	if arg[0] == '@' {
		f, err := os.Open(arg[1:])
		if err != nil {
			panic(err)
		}

		return tchannel.NewStreamingOutput(f)
	}

	return tchannel.BytesOutput([]byte(arg))

}

func main() {
	getopt.Parse()
	if *peerAddr == "" || *serviceName == "" || *operationName == "" ||
		*arg2 == "" || *arg3 == "" {
		getopt.Usage()
		os.Exit(-1)
	}

	ch, err := tchannel.NewChannel("0.0.0.0:0", nil)
	if err != nil {
		panic(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*time.Duration(*timeout))
	defer cancel()

	call, err := ch.BeginCall(ctx, *peerAddr, *serviceName, *operationName)
	if err != nil {
		panic(err)
	}

	if err := call.WriteArg2(asArgument(*arg2)); err != nil {
		panic(err)
	}

	if err := call.WriteArg3(asArgument(*arg3)); err != nil {
		panic(err)
	}

	var respArg2 tchannel.BytesInput
	if err := call.Response().ReadArg2(&respArg2); err != nil {
		panic(err)
	}

	if call.Response().ApplicationError() {
		log.Warning("Server returned application error")
	}

	log.Info("resp-arg2: %s", respArg2)

	var respArg3 tchannel.BytesInput
	if err := call.Response().ReadArg3(&respArg3); err != nil {
		panic(err)
	}

	log.Info("resp-arg3: %s", respArg3)
}
