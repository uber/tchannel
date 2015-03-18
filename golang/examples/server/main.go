package main

import (
	"code.google.com/p/getopt"
	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/examples"
	"golang.org/x/net/context"
	"os"
	"time"
)

var log = examples.LogrusLogger{}

func echo(ctx context.Context, call *tchannel.InboundCall) {
	var inArg2 tchannel.BytesInput
	if err := call.ReadArg2(&inArg2); err != nil {
		log.Errorf("could not start arg2: %v", err)
		return
	}

	log.Infof("Arg2: %s", inArg2)

	var inArg3 tchannel.BytesInput
	if err := call.ReadArg3(&inArg3); err != nil {
		log.Errorf("could not start arg3: %v", err)
		return
	}

	log.Infof("Arg3: %s", inArg3)

	if err := call.Response().WriteArg2(tchannel.BytesOutput(inArg2)); err != nil {
		log.Errorf("could not write arg2: %v", err)
		return
	}

	if err := call.Response().WriteArg3(tchannel.BytesOutput(inArg3)); err != nil {
		log.Errorf("could not write arg3: %v", err)
		return
	}
}

func serverBusy(ctx context.Context, call *tchannel.InboundCall) {
	call.Response().SendSystemError(tchannel.ErrServerBusy)
}

func badRequest(ctx context.Context, call *tchannel.InboundCall) {
	call.Response().SendSystemError(tchannel.ErrHandlerNotFound)
}

func timeout(ctx context.Context, call *tchannel.InboundCall) {
	deadline, _ := ctx.Deadline()
	log.Infof("Client requested timeout in %dms", int(deadline.Sub(time.Now()).Seconds()*1000))

	pastDeadline := deadline.Add(time.Second * 2)
	time.Sleep(pastDeadline.Sub(time.Now()))
	echo(ctx, call)
}

func appError(ctx context.Context, call *tchannel.InboundCall) {
	call.Response().SetApplicationError()
	echo(ctx, call)
}

var bindAddr = getopt.StringLong("bind", 'b', "0.0.0.0:10500", "host and port on which to bind")

func main() {
	getopt.Parse()

	ch, err := tchannel.NewChannel(*bindAddr, &tchannel.ChannelOptions{
		Logger: log,
	})
	if err != nil {
		log.Errorf("could not create channel on %s: %v", *bindAddr, err)
		os.Exit(-1)
	}

	ch.Register(tchannel.HandlerFunc(echo), "TestService", "echo")
	ch.Register(tchannel.HandlerFunc(serverBusy), "TestService", "busy")
	ch.Register(tchannel.HandlerFunc(badRequest), "TestService", "badRequest")
	ch.Register(tchannel.HandlerFunc(appError), "TestService", "appError")
	ch.Register(tchannel.HandlerFunc(timeout), "TestService", "timeout")

	if err := ch.ListenAndHandle(); err != nil {
		panic(err)
	}
}

func panicOnError(err error) {
	if err != nil {
		panic(err)
	}
}
