package main

import (
	"flag"
	"log"
	"net/http"
	_ "net/http/pprof"
	"runtime"
	"sync/atomic"
	"time"

	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/raw"
	"golang.org/x/net/context"
)

var (
	hostPort      = flag.String("hostPort", "localhost:12345", "listening socket of the bench server")
	numGoroutines = flag.Int("numGo", 1, "The number of goroutines to spawn")
	numOSThreads  = flag.Int("numThreads", 1, "The number of OS threads to use (sets GOMAXPROCS)")

	// counter tracks the total number of requests completed in the past second.
	counter int64
)

func main() {
	flag.Parse()
	runtime.GOMAXPROCS(*numOSThreads)

	// Sets up a listener for pprof.
	go func() {
		log.Println(http.ListenAndServe("localhost:6061", nil))
	}()

	ch, err := tchannel.NewChannel("benchmark-client", nil)
	if err != nil {
		log.Fatalf("NewChannel failed: %v", err)
	}
	for i := 0; i < *numGoroutines; i++ {
		go worker(ch)
	}

	log.Printf("Config: %v workers on %v threads", *numGoroutines, *numOSThreads)
	requestCountReporter()
}

func requestCountReporter() {
	for {
		time.Sleep(time.Second)
		cur := atomic.SwapInt64(&counter, int64(0))
		log.Printf("%v requests", cur)
	}
}

func worker(ch *tchannel.Channel) {
	data := make([]byte, 4096)
	for {
		if err := setRequest(ch, "key", string(data)); err != nil {
			log.Fatalf("set failed: %v", err)
			continue
		}
		atomic.AddInt64(&counter, 1)
		_, err := getRequest(ch, "key")
		if err != nil {
			log.Fatalf("get failed: %v", err)
		}
		atomic.AddInt64(&counter, 1)
	}
}

func setRequest(ch *tchannel.Channel, key, value string) error {
	ctx, _ := context.WithTimeout(context.Background(), time.Second*10)
	_, _, _, err := raw.Call(ctx, ch, *hostPort, "bench-server", "set", []byte(key), []byte(value))
	return err
}

func getRequest(ch *tchannel.Channel, key string) (string, error) {
	ctx, _ := context.WithTimeout(context.Background(), time.Second)
	_, arg3, _, err := raw.Call(ctx, ch, *hostPort, "bench-server", "get", []byte(key), nil)
	return string(arg3), err
}
