/*
 * Copyright (c) 2015 Uber Technologies, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
package com.uber.tchannel.messages;

import java.util.Optional;


public enum MessageType {

    InitRequest((byte) 0x01),
    InitResponse((byte) 0x02),
    CallRequest((byte) 0x03),
    CallResponse((byte) 0x04),
    CallRequestContinue((byte) 0x13),
    CallResponseContinue((byte) 0x14),
    Cancel((byte) 0xc0),
    Claim((byte) 0xc1),
    PingRequest((byte) 0xd0),
    PingResponse((byte) 0xd1),
    Error((byte) 0xff);

    private final byte type;

    MessageType(byte type) {
        this.type = type;
    }

    public static Optional<MessageType> fromByte(byte value) {
        switch (value) {
            case (byte) 0x01:
                return Optional.of(InitRequest);
            case (byte) 0x02:
                return Optional.of(InitResponse);
            case (byte) 0x03:
                return Optional.of(CallRequest);
            case (byte) 0x04:
                return Optional.of(CallResponse);
            case (byte) 0x13:
                return Optional.of(CallRequestContinue);
            case (byte) 0x14:
                return Optional.of(CallResponseContinue);
            case (byte) 0xc0:
                return Optional.of(Cancel);
            case (byte) 0xc1:
                return Optional.of(Claim);
            case (byte) 0xd0:
                return Optional.of(PingRequest);
            case (byte) 0xd1:
                return Optional.of(PingResponse);
            case (byte) 0xff:
                return Optional.of(Error);
            default:
                return Optional.empty();
        }
    }

    public byte byteValue() {
        return this.type;
    }

}
