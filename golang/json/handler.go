package json

import (
	"fmt"
	"reflect"

	"github.com/uber/tchannel/golang"

	"golang.org/x/net/context"
)

var (
	typeOfError   = reflect.TypeOf((*error)(nil)).Elem()
	typeOfContext = reflect.TypeOf((*Context)(nil)).Elem()
)

// verifyHandler ensures that the given t is a function with the following signature:
// func(context.Context, *ArgType)(*ResType, error)
func verifyHandler(t reflect.Type) error {
	if t.NumIn() != 2 || t.NumOut() != 2 {
		return fmt.Errorf("handler should be of format func(context.Context, *ArgType) (*ResType, error)")
	}

	isStructPtr := func(t reflect.Type) bool {
		return t.Kind() == reflect.Ptr && t.Elem().Kind() == reflect.Struct
	}

	if t.In(0) != typeOfContext {
		return fmt.Errorf("arg0 should be of type context.Context")
	}
	if !isStructPtr(t.In(1)) {
		return fmt.Errorf("arg1 should be a pointer to an args struct")
	}
	if !isStructPtr(t.Out(0)) {
		return fmt.Errorf("first return value should be a pointer to a result struct")
	}
	if !t.Out(1).AssignableTo(typeOfError) {
		return fmt.Errorf("second return value should be an error")
	}

	return nil
}

type handler struct {
	handler reflect.Value
	argType reflect.Type
}

func toHandler(f interface{}) (*handler, error) {
	hV := reflect.ValueOf(f)
	if err := verifyHandler(hV.Type()); err != nil {
		return nil, err
	}
	argType := hV.Type().In(1)
	return &handler{hV, argType}, nil
}

// Register registers the specified methods specified as a map from method name to the
// JSON handler function. The handler functions should have the following signature:
// func(context.Context, *ArgType)(*ResType, error)
func Register(ch *tchannel.Channel, funcs map[string]interface{}, onError func(context.Context, error)) error {
	handlers := make(map[string]*handler)

	handler := tchannel.HandlerFunc(func(ctx context.Context, call *tchannel.InboundCall) {
		h, ok := handlers[string(call.Operation())]
		if !ok {
			onError(ctx, fmt.Errorf("call for unregistered method: %s", call.Operation()))
			return
		}

		if err := h.Handle(ctx, call); err != nil {
			onError(ctx, err)
		}
	})

	for m, f := range funcs {
		h, err := toHandler(f)
		if err != nil {
			return fmt.Errorf("%v cannot be used as a handler: %v", m, err)
		}
		handlers[m] = h
		ch.Register(handler, m)
	}

	return nil
}

// Handle deserializes the JSON arguments and calls the underlying handler.
func (h *handler) Handle(tctx context.Context, call *tchannel.InboundCall) error {
	var headers interface{}
	if err := tchannel.NewArgReader(call.Arg2Reader()).ReadJSON(&headers); err != nil {
		return fmt.Errorf("arg2 read failed: %v", err)
	}
	ctx := WithHeaders(tctx, headers)

	// arg3 will be a pointer to a struct.
	arg3 := reflect.New(h.argType.Elem())
	if err := tchannel.NewArgReader(call.Arg3Reader()).ReadJSON(arg3.Interface()); err != nil {
		return fmt.Errorf("arg3 read failed: %v", err)
	}

	args := []reflect.Value{reflect.ValueOf(ctx), arg3}
	results := h.handler.Call(args)

	res := results[0].Interface()
	err := results[1].Interface()
	// If an error was returned, we create an error arg3 to respond with.
	if err != nil {
		call.Response().SetApplicationError()
		// TODO(prashant): Allow client to customize the error in more ways.
		res = struct {
			Type    string `json:"type"`
			Message string `json:"message"`
		}{
			Type:    "error",
			Message: err.(error).Error(),
		}
	}

	if err := tchannel.NewArgWriter(call.Response().Arg2Writer()).WriteJSON(ctx.ResponseHeaders()); err != nil {
		return err
	}

	return tchannel.NewArgWriter(call.Response().Arg3Writer()).WriteJSON(res)
}
