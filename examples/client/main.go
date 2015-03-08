package main

import (
	"code.google.com/p/getopt"
	"code.google.com/p/go.net/context"
	"code.uber.internal/personal/mmihic/tchannel-go"
	"github.com/op/go-logging"
	"io"
	"io/ioutil"
	"os"
	"strings"
	"time"
)

var log = logging.MustGetLogger("tchannel.client")

var peerAddr = getopt.StringLong("peer", 'p', "", "Host and port of remote peer")
var serviceName = getopt.StringLong("service", 's', "", "Name of service to invoke")
var operationName = getopt.StringLong("operation", 'o', "", "Name of operation to invoke")
var arg2 = getopt.StringLong("arg2", '2', "", "Input for arg2.  Curl-style, use @foo.txt to read from foo.txt")
var arg3 = getopt.StringLong("arg3", '3', "", "Input for arg3.  Curl-style, use @foo.txt to read from foo.txt")
var timeout = getopt.IntLong("timeout", 't', 30, "Timeout (in seconds)")

func writeArg(w io.Writer, arg string) error {
	var r io.Reader
	var err error
	if arg[0] == '@' {
		if r, err = os.Open(arg[1:]); err != nil {
			return err
		}
	} else {
		r = strings.NewReader(arg)
	}

	_, err = io.Copy(w, r)
	if err != io.EOF {
		return err
	}

	return nil
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

	w, err := call.BeginArg2()
	if err != nil {
		panic(err)
	}

	if err := writeArg(w, *arg2); err != nil {
		panic(err)
	}

	w, err = call.BeginArg3()
	if err != nil {
		panic(err)
	}

	if err := writeArg(w, *arg3); err != nil {
		panic(err)
	}

	resp, err := call.RoundTrip()
	if err != nil {
		panic(err)
	}

	r, err := resp.ExpectArg2()
	if err != nil {
		panic(err)
	}

	respArg2, err := ioutil.ReadAll(r)
	if err != nil {
		panic(err)
	}

	log.Info("resp-arg2: %s", respArg2)

	r, err = resp.ExpectArg3()
	if err != nil {
		panic(err)
	}

	respArg3, err := ioutil.ReadAll(r)
	if err != nil {
		panic(err)
	}

	log.Info("resp-arg3: %s", respArg3)
}
