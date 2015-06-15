package hyperbahn

import (
	"errors"
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/testutils"
	"golang.org/x/net/context"
)

func registrationHandler(t *testing.T, f func(req adRequest) (adResponse, error)) tchannel.Handler {
	return tchannel.HandlerFunc(func(ctx context.Context, call *tchannel.InboundCall) {
		var arg2 []byte
		var req adRequest
		require.NoError(t, tchannel.NewArgReader(call.Arg2Reader()).Read(&arg2))
		require.NoError(t, tchannel.NewArgReader(call.Arg3Reader()).ReadJSON(&req))

		resp := call.Response()
		response, err := f(req)
		if err != nil {
			resp.SetApplicationError()
			require.NoError(t, tchannel.NewArgWriter(resp.Arg2Writer()).Write([]byte("")))
			require.NoError(t, tchannel.NewArgWriter(resp.Arg3Writer()).Write([]byte("false")))
			return
		}
		require.NoError(t, tchannel.NewArgWriter(resp.Arg2Writer()).Write(nil))
		require.NoError(t, tchannel.NewArgWriter(resp.Arg3Writer()).WriteJSON(response))
	})
}

func TestRegistrationFailed(t *testing.T) {
	withSetup(t, func(serverCh *tchannel.Channel, hostPort string) {
		clientCh, err := tchannel.NewChannel("my-client", nil)
		require.NoError(t, err)
		defer clientCh.Close()

		client := NewClient(clientCh, []string{hostPort}, nil)
		require.Error(t, client.Register())
	})
}

type retryTest struct {
	// channel used to control the response to an 'ad' call.
	respCh chan int
	// req is the adRequest sent to the adHandler.
	req adRequest

	// sleep stub channels.
	sleepArgs  <-chan time.Duration
	sleepBlock chan<- struct{}

	client *Client
	mock   mock.Mock
}

func (r *retryTest) On(event Event) {
	r.mock.Called(event)
}
func (r *retryTest) OnError(err error) {
	r.mock.Called(err)
}

func (r *retryTest) adHandler(req adRequest) (adResponse, error) {
	r.req = req
	v := <-r.respCh
	if v == 0 {
		return adResponse{}, errors.New("failed")
	}
	return adResponse{v}, nil
}

func (r *retryTest) setup() {
	r.respCh = make(chan int, 1)
	r.sleepArgs, r.sleepBlock = testutils.SleepStub(&timeSleep)
}

func (r *retryTest) setRegistrationSuccess() {
	r.respCh <- 1
}

func (r *retryTest) setRegistrationFailure() {
	r.respCh <- 0
}

func runRetryTest(t *testing.T, f func(r *retryTest)) {
	r := &retryTest{}
	testutils.SetTimeout(t, time.Second)
	r.setup()
	defer testutils.ResetSleepStub(&timeSleep)

	withSetup(t, func(serverCh *tchannel.Channel, hostPort string) {
		serverCh.Register(registrationHandler(t, r.adHandler), "ad")

		clientCh, err := tchannel.NewChannel("my-client", nil)
		require.NoError(t, err)
		defer clientCh.Close()

		r.client = NewClient(clientCh, []string{hostPort}, &ClientOptions{Handler: r})
		f(r)
		r.mock.AssertExpectations(t)
	})
}

func TestRegistrationSuccess(t *testing.T) {
	runRetryTest(t, func(r *retryTest) {
		r.mock.On("On", RegistrationAttempt).Return().
			Times(1 /* initial */ + 10 /* successful retries */)
		r.mock.On("On", Registered).Return().Once()
		r.setRegistrationSuccess()
		require.NoError(t, r.client.Register())

		// Verify that the arguments passed to 'ad' are correct.
		expectedRequest := adRequest{[]service{{Name: "my-client", Cost: 0}}}
		require.Equal(t, expectedRequest, r.req)

		// Verify re-registrations happen after sleeping for ~registrationInterval.
		r.mock.On("On", RegistrationRefreshed).Return().Times(10)
		for i := 0; i < 10; i++ {
			s1 := <-r.sleepArgs
			require.True(t, s1 >= registrationInterval-fuzzInterval)
			require.True(t, s1 <= registrationInterval+fuzzInterval)
			r.sleepBlock <- struct{}{}

			r.setRegistrationSuccess()
			require.Equal(t, expectedRequest, r.req)
		}

		// Block till the last registration completes.
		<-r.sleepArgs
	})
}

func TestRetryTemporaryFailure(t *testing.T) {
	runRetryTest(t, func(r *retryTest) {
		r.mock.On("On", RegistrationAttempt).Return().
			Times(1 /* initial */ + 3 /* fail */ + 10 /* successful */)
		r.mock.On("On", Registered).Return().Once()
		r.setRegistrationSuccess()
		require.NoError(t, r.client.Register())

		s1 := <-r.sleepArgs
		require.True(t, s1 >= registrationInterval-fuzzInterval)
		require.True(t, s1 <= registrationInterval+fuzzInterval)

		// When registrations fail, it retries after a short connection and triggers OnError.
		r.mock.On("OnError", ErrRegistrationFailed{true, ErrAppError}).Return(nil).Times(3)
		for i := 0; i < 3; i++ {
			r.sleepBlock <- struct{}{}
			r.setRegistrationFailure()

			s1 := <-r.sleepArgs
			require.True(t, s1 == registrationRetryInterval)
		}

		// If the retry suceeds, then it goes back to normal.
		r.mock.On("On", RegistrationRefreshed).Return().Times(10)
		// Verify re-registrations continue as usual when it succeeds.
		for i := 0; i < 10; i++ {
			r.sleepBlock <- struct{}{}
			r.setRegistrationSuccess()

			s1 := <-r.sleepArgs
			require.True(t, s1 >= registrationInterval-fuzzInterval)
			require.True(t, s1 <= registrationInterval+fuzzInterval)
		}
	})
}

func TestRetryFailure(t *testing.T) {
	runRetryTest(t, func(r *retryTest) {
		r.mock.On("On", RegistrationAttempt).Return().
			Times(1 /* initial */ + maxRegistrationFailures /* fail */)
		r.mock.On("On", Registered).Return().Once()

		r.setRegistrationSuccess()
		require.NoError(t, r.client.Register())

		s1 := <-r.sleepArgs
		require.True(t, s1 >= registrationInterval-fuzzInterval)
		require.True(t, s1 <= registrationInterval+fuzzInterval)

		// When retries fail maxRegistrationFailures times, we receive:
		// maxRegistrationFailures - 1 OnError WithRetry=True
		// 1 OnError WithRetry=False
		noRetryFail := make(chan struct{})
		r.mock.On("OnError", ErrRegistrationFailed{true, ErrAppError}).Return(nil).Times(maxRegistrationFailures - 1)
		r.mock.On("OnError", ErrRegistrationFailed{false, ErrAppError}).Return(nil).Run(func(_ mock.Arguments) {
			noRetryFail <- struct{}{}
		}).Once()
		for i := 0; i < maxRegistrationFailures-1; i++ {
			r.sleepBlock <- struct{}{}
			r.setRegistrationFailure()

			s1 := <-r.sleepArgs
			require.True(t, s1 == registrationRetryInterval)
		}

		r.sleepBlock <- struct{}{}
		r.respCh <- 0

		// Wait for the handler to be called and the mock expectation to be recorded.
		<-noRetryFail
	})
}

func withSetup(t *testing.T, f func(ch *tchannel.Channel, hostPort string)) {
	serverCh, err := tchannel.NewChannel(hyperbahnServiceName, nil)
	require.NoError(t, err)
	defer serverCh.Close()
	listener, err := net.Listen("tcp", ":0")
	require.NoError(t, err)
	go serverCh.Serve(listener)

	f(serverCh, listener.Addr().String())
}
