// Copyright (c) 2015 Uber Technologies, Inc.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

package hyperbahn

import (
	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/json"
)

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

func (c *Client) createRequest() *adRequest {
	req := &adRequest{
		Services: make([]service, len(c.services)),
	}
	for i, s := range c.services {
		req.Services[i] = service{
			Name: s,
			Cost: 0,
		}
	}
	return req
}

func (c *Client) sendAdvertise() error {
	ctx, cancel := json.NewContext(c.opts.Timeout)
	defer cancel()

	// Disable tracing on Hyperbahn advertise messages to avoid cascading failures (see #790).
	tchannel.CurrentSpan(ctx).EnableTracing(false)

	sc := c.tchan.GetSubChannel(hyperbahnServiceName)
	arg := c.createRequest()
	var resp adResponse
	c.opts.Handler.On(SendAdvertise)

	if err := json.CallSC(ctx, sc, "ad", arg, &resp); err != nil {
		return err
	}

	return nil
}
