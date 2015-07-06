package raw

import (
	"github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
)

// Handler is the interface for a raw handler.
type Handler interface {
	// Handle is called on incoming calls, and contains all the arguments.
	// If an error is returned, it will set ApplicationError Arg3 will be the error string.
	Handle(ctx context.Context, args *Args) (*Res, error)
	OnError(ctx context.Context, err error)
}

// Args parses the arguments from an incoming call req.
type Args struct {
	Caller    string
	Format    tchannel.Format
	Operation string
	Arg2      []byte
	Arg3      []byte
}

// Res represents the response to an incoming call req.
type Res struct {
	SystemErr error
	// IsErr is used to set an application error on the underlying call res.
	IsErr bool
	Arg2  []byte
	Arg3  []byte
}

// Wrap wraps a Handler as a tchannel.Handler that can be passed to tchannel.Register.
func Wrap(handler Handler) tchannel.Handler {
	return tchannel.HandlerFunc(func(ctx context.Context, call *tchannel.InboundCall) {
		var args Args
		args.Caller = call.CallerName()
		args.Format = call.Format()
		args.Operation = string(call.Operation())
		if err := tchannel.NewArgReader(call.Arg2Reader()).Read(&args.Arg2); err != nil {
			handler.OnError(ctx, err)
			return
		}
		if err := tchannel.NewArgReader(call.Arg3Reader()).Read(&args.Arg3); err != nil {
			handler.OnError(ctx, err)
			return
		}

		resp, err := handler.Handle(ctx, &args)
		response := call.Response()
		if err != nil {
			resp = &Res{
				IsErr: true,
				Arg2:  nil,
				Arg3:  []byte(err.Error()),
			}
		}

		if resp.SystemErr != nil {
			if err := response.SendSystemError(resp.SystemErr); err != nil {
				handler.OnError(ctx, err)
			}
			return
		}
		if resp.IsErr {
			if err := response.SetApplicationError(); err != nil {
				handler.OnError(ctx, err)
				return
			}
		}
		if err := tchannel.NewArgWriter(response.Arg2Writer()).Write(resp.Arg2); err != nil {
			handler.OnError(ctx, err)
			return
		}
		if err := tchannel.NewArgWriter(response.Arg3Writer()).Write(resp.Arg3); err != nil {
			handler.OnError(ctx, err)
			return
		}
	})
}
