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

public abstract class AbstractCallMessage extends AbstractMessage {

    public static final int MAX_ARG1_LENGTH = 16384;
    public static final byte MORE_FRAGMENTS_TO_FOLLOW_MASK = (byte) 0x01;

    public final byte flags;
    public final byte checksumType;
    public final int checksum; // TODO: `checksums` are optional, can be removed for possible perf. wins.. //
    public byte[] arg1;
    public byte[] arg2;
    public byte[] arg3;

    public AbstractCallMessage(long id, MessageType messageType, byte flags, byte checksumType, int checksum,
                               byte[] arg1, byte[] arg2, byte[] arg3) {
        super(id, messageType);
        this.flags = flags;
        this.checksumType = checksumType;
        this.checksum = checksum;
        this.arg1 = arg1;
        this.arg2 = arg2;
        this.arg3 = arg3;
    }

    public boolean moreFragmentsRemain() {
        return ((this.flags & MORE_FRAGMENTS_TO_FOLLOW_MASK) == 1);
    }


}
