package hyperbahn

import (
	"fmt"
	"math/rand"
	"time"

	"golang.org/x/net/context"
)

const (
	// maxRegistrationFailures is the number of consecutive registration failures after
	// which we give up and trigger an OnError event.
	maxRegistrationFailures = 5
	// registrationInterval is the (approximate) time interval between re-registrations.
	// The interval is fuzzed to fuzzAmount.
	registrationInterval = 10 * time.Second
	// registrationRetryInterval is the duration to wait on failed registrations before retrying.
	registrationRetryInterval = 1 * time.Second
	// fuzzInterval is used to fuzz the registration interval.
	fuzzInterval = 10 * time.Second
)

// timeSleep is a variable for stubbing in unit tests.
var timeSleep = time.Sleep

// ErrRegistrationFailed is triggered when registration is failed.
type ErrRegistrationFailed struct {
	// WillRetry is set to true if registration will be retried.
	WillRetry bool
	// Cause is the underlying error returned from the register call.
	Cause error
}

func (e ErrRegistrationFailed) Error() string {
	return fmt.Sprintf("registration failed, retry: %v, cause: %v", e.WillRetry, e.Cause)
}

// The following parameters define the request/response for the Hyperbahn 'ad' call.
type service struct {
	Name string `json:"serviceName"`
	Cost int    `json:"cost"`
}

type adRequest struct {
	Services []service `json:"services"`
}

type adResponse struct {
	ConnectionCount int `json:"connectionCount"`
}

func (c *Client) sendRegistration() error {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	sc := c.tchan.GetSubChannel(hyperbahnServiceName)
	arg := &adRequest{
		Services: []service{{
			Name: c.tchan.PeerInfo().ServiceName,
			Cost: 0,
		}},
	}
	var resp adResponse
	c.opts.Handler.On(RegistrationAttempt)
	if err := makeJSONCall(ctx, sc, "ad", arg, &resp); err != nil {
		return err
	}

	return nil
}

func (c *Client) fuzzedRegistrationInterval() time.Duration {
	// fuzz is a random value between -fuzzInterval and fuzzInterval
	fuzz := time.Duration(rand.Intn(int(fuzzInterval)*2)) - fuzzInterval
	return registrationInterval + fuzz
}

// registrationLoops re-registers the service approximately every minute (with some fuzzing).
func (c *Client) registrationLoop() {
	sleepFor := c.fuzzedRegistrationInterval()
	consecutiveFailures := 0

	for {
		timeSleep(sleepFor)

		if err := c.sendRegistration(); err != nil {
			consecutiveFailures++
			if consecutiveFailures >= maxRegistrationFailures {
				c.opts.Handler.OnError(ErrRegistrationFailed{Cause: err, WillRetry: false})
				if c.opts.FailStrategy == FailStrategyFatal {
					c.tchan.Logger().Fatalf("Hyperbahn client registration failed: %v", err)
				}
				return
			}
			c.opts.Handler.OnError(ErrRegistrationFailed{Cause: err, WillRetry: true})
			sleepFor = registrationRetryInterval
		} else {
			c.opts.Handler.On(RegistrationRefreshed)
			sleepFor = c.fuzzedRegistrationInterval()
			consecutiveFailures = 0
		}
	}
}
