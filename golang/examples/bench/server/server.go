package main

import (
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	_ "net/http/pprof"
	"sync"

	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/raw"
	"golang.org/x/net/context"
)

var hostPort = flag.String("hostPort", "localhost:12345", "listening socket for the server")

func main() {
	flag.Parse()

	// Sets up a listener for pprof.
	go func() {
		log.Println(http.ListenAndServe("localhost:6060", nil))
	}()

	ch, err := tchannel.NewChannel("benchmark", &tchannel.ChannelOptions{
		ProcessName: "benchmark",
	})
	if err != nil {
		log.Fatalf("NewChannel failed: %v", err)
	}

	handler := raw.Wrap(&kvHandler{vals: make(map[string]string)})
	ch.Register(handler, "ping")
	ch.Register(handler, "get")
	ch.Register(handler, "set")

	if err := ch.ListenAndServe(*hostPort); err != nil {
		log.Fatalf("ListenAndServe failed: %v", err)
	}

	// Listen indefinitely.
	select {}
}

type kvHandler struct {
	mut  sync.RWMutex
	vals map[string]string
}

func (h *kvHandler) WithLock(write bool, f func()) {
	if write {
		h.mut.Lock()
	} else {
		h.mut.RLock()
	}

	f()

	if write {
		h.mut.Unlock()
	} else {
		h.mut.RUnlock()
	}
}

func (h *kvHandler) Ping(ctx context.Context, args *raw.Args) (*raw.Res, error) {
	return &raw.Res{
		Arg2: []byte("pong"),
	}, nil
}

func (h *kvHandler) Get(ctx context.Context, args *raw.Args) (*raw.Res, error) {
	var arg3 []byte
	h.WithLock(false /* write */, func() {
		arg3 = []byte(h.vals[string(args.Arg2)])
	})

	return &raw.Res{
		Arg2: []byte(fmt.Sprint(len(arg3))),
		Arg3: arg3,
	}, nil
}

func (h *kvHandler) Set(ctx context.Context, args *raw.Args) (*raw.Res, error) {
	h.WithLock(true /* write */, func() {
		h.vals[string(args.Arg2)] = string(args.Arg3)
	})
	return &raw.Res{
		Arg2: []byte("ok"),
		Arg3: []byte("really ok"),
	}, nil
}

func (h *kvHandler) Handle(ctx context.Context, args *raw.Args) (*raw.Res, error) {
	switch args.Operation {
	case "ping":
		return h.Ping(ctx, args)
	case "get":
		return h.Get(ctx, args)
	case "put":
		return h.Set(ctx, args)
	default:
		return nil, errors.New("unknown operation")
	}
}

func (h *kvHandler) OnError(ctx context.Context, err error) {
	log.Fatalf("OnError %v", err)
}
