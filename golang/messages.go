package tchannel

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

import (
	"fmt"
	"github.com/uber/tchannel/golang/typed"
	"time"
)

// Type of message
type messageType byte

const (
	messageTypeInitReq         messageType = 0x01
	messageTypeInitRes         messageType = 0x02
	messageTypeCallReq         messageType = 0x03
	messageTypeCallRes         messageType = 0x04
	messageTypeCallReqContinue messageType = 0x13
	messageTypeCallResContinue messageType = 0x14
	messageTypeError           messageType = 0xFF
)

var messageTypeNames = map[messageType]string{
	messageTypeInitReq:         "initReq",
	messageTypeInitRes:         "initRes",
	messageTypeCallReq:         "callReq",
	messageTypeCallReqContinue: "callReqContinue",
	messageTypeCallRes:         "callRes",
	messageTypeCallResContinue: "callResContinue",
	messageTypeError:           "Error",
}

func (t messageType) String() string {
	if name := messageTypeNames[t]; name != "" {
		return name
	}

	return fmt.Sprintf("unknown: %x", int(t))
}

// Base interface for messages.  Has an id and a type, and knows how to read and write onto a binary stream
type message interface {
	// The id of the message
	ID() uint32

	// The type of the message
	messageType() messageType

	read(r *typed.ReadBuffer) error
	write(w *typed.WriteBuffer) error
}

// Parameters to an initReq/InitRes
type initParams map[string]string

// Standard init params
const (
	InitParamHostPort    = "host_port"
	InitParamProcessName = "process_name"
)

type initMessage struct {
	id         uint32
	Version    uint16
	initParams initParams
}

func (m *initMessage) read(r *typed.ReadBuffer) error {
	var err error
	m.Version, err = r.ReadUint16()
	if err != nil {
		return err
	}

	m.initParams = initParams{}
	np, err := r.ReadUint16()
	if err != nil {
		return err
	}

	for i := 0; i < int(np); i++ {
		klen, err := r.ReadUint16()
		if err != nil {
			return err
		}

		k, err := r.ReadString(int(klen))
		if err != nil {
			return err
		}

		vlen, err := r.ReadUint16()
		if err != nil {
			return err
		}

		v, err := r.ReadString(int(vlen))
		if err != nil {
			return err
		}

		m.initParams[k] = v
	}

	return nil
}

func (m *initMessage) write(w *typed.WriteBuffer) error {
	if err := w.WriteUint16(m.Version); err != nil {
		return err
	}

	if err := w.WriteUint16(uint16(len(m.initParams))); err != nil {
		return err
	}

	for k, v := range m.initParams {
		if err := w.WriteUint16(uint16(len(k))); err != nil {
			return err
		}

		if err := w.WriteString(k); err != nil {
			return err
		}

		if err := w.WriteUint16(uint16(len(v))); err != nil {
			return err
		}

		if err := w.WriteString(v); err != nil {
			return err
		}
	}

	return nil
}

func (m *initMessage) ID() uint32 {
	return m.id
}

// An initReq, containing context information to exchange with peer
type initReq struct {
	initMessage
}

func (m *initReq) messageType() messageType { return messageTypeInitReq }

// An InitRes, containing context information to return to intiating peer
type initRes struct {
	initMessage
}

func (m *initRes) messageType() messageType { return messageTypeInitRes }

// Headers passed as part of a CallReq/CallRes
type callHeaders map[string]string

func (ch callHeaders) read(r *typed.ReadBuffer) error {
	nh, err := r.ReadByte()
	if err != nil {
		return err
	}

	for i := 0; i < int(nh); i++ {
		klen, err := r.ReadByte()
		if err != nil {
			return err
		}

		k, err := r.ReadString(int(klen))
		if err != nil {
			return err
		}

		vlen, err := r.ReadByte()
		if err != nil {
			return err
		}

		v, err := r.ReadString(int(vlen))
		if err != nil {
			return err
		}

		ch[k] = v
	}

	return nil
}

func (ch callHeaders) write(w *typed.WriteBuffer) error {
	if err := w.WriteByte(byte(len(ch))); err != nil {
		return err
	}

	for k, v := range ch {
		if err := w.WriteByte(byte(len(k))); err != nil {
			return err
		}

		if err := w.WriteString(k); err != nil {
			return err
		}

		if err := w.WriteByte(byte(len(v))); err != nil {
			return err
		}

		if err := w.WriteString(v); err != nil {
			return err
		}
	}

	return nil
}

// A CallReq for service
type callReq struct {
	id         uint32
	TimeToLive time.Duration
	Tracing    Span
	Headers    callHeaders
	Service    []byte
}

func (m *callReq) ID() uint32               { return m.id }
func (m *callReq) messageType() messageType { return messageTypeCallReq }
func (m *callReq) read(r *typed.ReadBuffer) error {
	var err error
	ttl, err := r.ReadUint32()
	if err != nil {
		return err
	}

	m.TimeToLive = time.Duration(ttl) * time.Millisecond
	if err := m.Tracing.read(r); err != nil {
		return err
	}

	serviceNameLen, err := r.ReadByte()
	if err != nil {
		return err
	}

	if m.Service, err = r.ReadBytes(int(serviceNameLen)); err != nil {
		return err
	}

	m.Headers = callHeaders{}
	if err := m.Headers.read(r); err != nil {
		return err
	}
	return nil
}

func (m *callReq) write(w *typed.WriteBuffer) error {
	if err := w.WriteUint32(uint32(m.TimeToLive.Seconds() * 1000)); err != nil {
		return err
	}

	if err := m.Tracing.write(w); err != nil {
		return err
	}

	if err := w.WriteByte(byte(len(m.Service))); err != nil {
		return err
	}

	if err := w.WriteBytes(m.Service); err != nil {
		return err
	}

	if err := m.Headers.write(w); err != nil {
		return err
	}
	return nil
}

// A continuatin of a previous CallReq
type callReqContinue struct {
	id uint32
}

func (c *callReqContinue) ID() uint32                       { return c.id }
func (c *callReqContinue) messageType() messageType         { return messageTypeCallReqContinue }
func (c *callReqContinue) read(r *typed.ReadBuffer) error   { return nil }
func (c *callReqContinue) write(w *typed.WriteBuffer) error { return nil }

// ResponseCode to a CallReq
type ResponseCode byte

const (
	responseOK               ResponseCode = 0x00
	responseApplicationError ResponseCode = 0x01
)

// A response to a CallReq
type callRes struct {
	id           uint32
	ResponseCode ResponseCode
	Tracing      Span
	Headers      callHeaders
}

func (m *callRes) ID() uint32               { return m.id }
func (m *callRes) messageType() messageType { return messageTypeCallRes }

func (m *callRes) read(r *typed.ReadBuffer) error {
	var err error
	c, err := r.ReadByte()
	if err != nil {
		return err
	}
	m.ResponseCode = ResponseCode(c)

	if err := m.Tracing.read(r); err != nil {
		return err
	}

	m.Headers = callHeaders{}
	if err := m.Headers.read(r); err != nil {
		return err
	}

	return nil
}

func (m *callRes) write(w *typed.WriteBuffer) error {
	if err := w.WriteByte(byte(m.ResponseCode)); err != nil {
		return err
	}

	if err := m.Tracing.write(w); err != nil {
		return err
	}

	if err := m.Headers.write(w); err != nil {
		return err
	}

	return nil
}

// A continuation of a previous CallRes
type callResContinue struct {
	id uint32
}

func (c *callResContinue) ID() uint32                       { return c.id }
func (c *callResContinue) messageType() messageType         { return messageTypeCallResContinue }
func (c *callResContinue) read(r *typed.ReadBuffer) error   { return nil }
func (c *callResContinue) write(w *typed.WriteBuffer) error { return nil }

// An Error message, a system-level error response to a request or a protocol level error
type errorMessage struct {
	id        uint32
	errorCode SystemErrorCode
	tracing   Span
	message   string
}

func (m *errorMessage) ID() uint32               { return m.id }
func (m *errorMessage) messageType() messageType { return messageTypeError }
func (m *errorMessage) read(r *typed.ReadBuffer) error {
	errCode, err := r.ReadByte()
	if err != nil {
		return err
	}

	m.errorCode = SystemErrorCode(errCode)
	if err := m.tracing.read(r); err != nil {
		return err
	}

	msgSize, err := r.ReadUint16()
	if err != nil {
		return err
	}

	if m.message, err = r.ReadString(int(msgSize)); err != nil {
		return err
	}

	return nil
}

func (m *errorMessage) write(w *typed.WriteBuffer) error {
	if err := w.WriteByte(byte(m.errorCode)); err != nil {
		return err
	}

	if err := m.tracing.write(w); err != nil {
		return err
	}

	if err := w.WriteUint16(uint16(len(m.message))); err != nil {
		return err
	}

	if err := w.WriteString(m.message); err != nil {
		return err
	}

	return nil
}

func (m errorMessage) AsSystemError() error {
	// TODO(mmihic): Might be nice to return one of the well defined error types
	return NewSystemError(m.errorCode, m.message)
}
