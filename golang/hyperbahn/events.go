package hyperbahn

// Event describes different events that Client can trigger.
type Event int

const (
	// UnknownEvent should never be used.
	UnknownEvent Event = iota
	// RegistrationAttempt is triggerred when the client tries to register.
	RegistrationAttempt
	// Registered is triggerred when the initial registration for a service is successful.
	Registered
	// RegistrationRefreshed is triggerred on periodic registrations.
	RegistrationRefreshed
)

//go:generate stringer -type=Event

// Handler
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
