package main

import (
	"code.google.com/p/getopt"
	"code.google.com/p/go.net/context"
	"code.uber.internal/personal/mmihic/tchannel-go"
	"github.com/op/go-logging"
	"io"
	"io/ioutil"
	"time"
)

var log = logging.MustGetLogger("tchannel.server")

func echo(ctx context.Context, call *tchannel.InboundCall) {
	rarg2, err := call.ExpectArg2()
	if err != nil {
		log.Error("could not start arg2: %v", err)
		return
	}

	arg2, err := ioutil.ReadAll(rarg2)
	if err != nil && err != io.EOF {
		log.Error("could not read arg2: %v", err)
		return
	}

	log.Info("Arg2: %s", arg2)

	rarg3, err := call.ExpectArg3()
	if err != nil {
		log.Error("could not start arg3: %v", err)
		return
	}

	arg3, err := ioutil.ReadAll(rarg3)
	if err != nil && err != io.EOF {
		log.Error("could not read arg3: %v", err)
		return
	}

	log.Info("Arg3: %s", arg3)

	warg2, err := call.Response().BeginArg2()
	if err != nil {
		log.Error("coult not start writing arg2: %v", err)
		return
	}

	if _, err := warg2.Write(arg2); err != nil {
		log.Error("could not write arg2: %v", err)
		return
	}

	warg3, err := call.Response().BeginArg3()
	if err != nil {
		log.Error("could not start writing arg3: %v", err)
		return
	}

	if _, err := warg3.Write(arg3); err != nil {
		log.Error("could not write arg3: %v", err)
		return
	}

	if err := call.Response().Send(); err != nil {
		log.Error("could not send full response: %v", err)
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
	log.Info("Client requested timeout in %dms", int(deadline.Sub(time.Now()).Seconds()*1000))

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

	ch, err := tchannel.NewChannel(*bindAddr, nil)
	if err != nil {
		panic(err)
	}

	ch.Register(tchannel.HandleFunc(echo), "TestService", "echo")
	ch.Register(tchannel.HandleFunc(serverBusy), "TestService", "busy")
	ch.Register(tchannel.HandleFunc(badRequest), "TestService", "badRequest")
	ch.Register(tchannel.HandleFunc(appError), "TestService", "appError")
	ch.Register(tchannel.HandleFunc(timeout), "TestService", "timeout")

	if err := ch.ListenAndHandle(); err != nil {
		panic(err)
	}
}

func panicOnError(err error) {
	if err != nil {
		panic(err)
	}
}
