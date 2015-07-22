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
package com.uber.tchannel.tracing;

public class Trace {

    public static final int TRACING_HEADER_LENGTH = 25;
    private static final byte TRACING_ENABLED_MASK = (byte) 0x01;

    public final long spanId; // Unsigned
    public final long parentId; // Unsigned
    public final long traceId; // Unsigned
    public final byte traceFlags;

    public Trace(long spanId, long parentId, long traceId, byte traceFlags) {
        this.spanId = spanId;
        this.parentId = parentId;
        this.traceId = traceId;
        this.traceFlags = traceFlags;
    }

    public boolean isTracingEnabled() {
        return (this.traceFlags & TRACING_ENABLED_MASK) == (byte) 1;
    }
}
