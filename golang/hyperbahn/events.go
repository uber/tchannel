package hyperbahn

// Event describes different events that Client can trigger.
type Event int

const (
	// UnknownEvent should never be used.
	UnknownEvent Event = iota
	// SendAdvertise is triggered when the Hyperbahn client tries to advertise.
	SendAdvertise
	// Advertised is triggered when the initial advertisement for a service is successful.
	Advertised
	// Readvertised is triggered on periodic advertisements.
	Readvertised
)

//go:generate stringer -type=Event

// Handler is the interface for handling Hyperbahn events and errors.
type Handler interface {
	// On is called when events are triggered.
	On(event Event)
	// OnError is called when an error is detected.
	OnError(err error)
}

// nullHandler is the default Handler if nil is passed, so handlers can always be called.
type nullHandler struct{}

func (nullHandler) On(event Event)    {}
func (nullHandler) OnError(err error) {}
