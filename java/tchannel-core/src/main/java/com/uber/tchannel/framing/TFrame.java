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
package com.uber.tchannel.framing;

import com.uber.tchannel.messages.MessageType;
import io.netty.buffer.ByteBuf;

public class TFrame {


    public static final int MAX_FRAME_LENGTH = 65536;
    public static final int FRAME_HEADER_LENGTH = 16;

    public final int size;
    public final byte type;
    public final long id;
    public final ByteBuf payload;


    public TFrame(int size, byte type, long id, ByteBuf payload) {
        this.size = size;
        this.type = type;
        this.id = id;
        this.payload = payload;
    }

    public TFrame(int size, MessageType messageType, long id, ByteBuf payload) {
        this(size, messageType.byteValue(), id, payload);
    }

    @Override
    public String toString() {
        return String.format(
                "<TFrame size=%d type=0x%d id=%d payload=%s>",
                this.size,
                this.type,
                this.id,
                this.payload
        );
    }
}
