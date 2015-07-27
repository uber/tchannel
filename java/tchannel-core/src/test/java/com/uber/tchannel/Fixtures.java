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
package com.uber.tchannel;

import com.uber.tchannel.messages.AbstractCallMessage;
import com.uber.tchannel.messages.CallRequest;
import com.uber.tchannel.messages.CallRequestContinue;
import io.netty.buffer.Unpooled;

public class Fixtures {

    public static CallRequest callRequestWithId(long id) {
        return new CallRequest(
                id,
                (byte) 0x00,
                0L,
                null,
                null,
                null,
                (byte) 0x00,
                0,
                Unpooled.wrappedBuffer("arg1".getBytes()),
                Unpooled.wrappedBuffer("arg2".getBytes()),
                Unpooled.wrappedBuffer("arg3".getBytes())
        );
    }

    public static CallRequest callRequestWithIdAndMoreFragments(long id) {
        return new CallRequest(
                id,
                AbstractCallMessage.MORE_FRAGMENTS_TO_FOLLOW_MASK,
                0L,
                null,
                null,
                null,
                (byte) 0x00,
                0,
                Unpooled.wrappedBuffer("arg1".getBytes()),
                Unpooled.wrappedBuffer("arg2".getBytes()),
                Unpooled.wrappedBuffer("arg3".getBytes())
        );
    }


    public static CallRequestContinue callRequestContinueWithId(long id) {
        return new CallRequestContinue(
                id,
                (byte) 0x00,
                (byte) 0x00,
                0,
                Unpooled.wrappedBuffer("arg1".getBytes()),
                Unpooled.wrappedBuffer("arg2".getBytes()),
                Unpooled.wrappedBuffer("arg3".getBytes())
        );
    }

    public static CallRequestContinue callRequestContinueWithIdAndMoreFragments(long id) {
        return new CallRequestContinue(
                id,
                AbstractCallMessage.MORE_FRAGMENTS_TO_FOLLOW_MASK,
                (byte) 0x00,
                0,
                Unpooled.wrappedBuffer("arg1".getBytes()),
                Unpooled.wrappedBuffer("arg2".getBytes()),
                Unpooled.wrappedBuffer("arg3".getBytes())
        );
    }

}
