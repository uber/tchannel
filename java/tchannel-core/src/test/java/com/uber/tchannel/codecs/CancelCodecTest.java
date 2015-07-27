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
package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.Cancel;
import com.uber.tchannel.tracing.Trace;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class CancelCodecTest {

    @Test
    public void testEncodeDecode() throws Exception {

        EmbeddedChannel channel = new EmbeddedChannel(
                new LengthFieldBasedFrameDecoder(TFrame.MAX_FRAME_LENGTH, 0, 2, -2, 0, true),
                new TFrameCodec(),
                new CancelCodec()
        );

        Cancel cancel = new Cancel(Long.MAX_VALUE, Long.MAX_VALUE, new Trace(0, 1, 2, (byte) 0x03), "Whoopsies");

        channel.writeInbound(cancel);
        Cancel newCancel = channel.readInbound();
        assertEquals(cancel.getId(), newCancel.getId());
        assertEquals(cancel.getTtl(), newCancel.getTtl());
        assertTrue(newCancel.getTtl() > 0);
        assertEquals(cancel.getTracing().traceId, newCancel.getTracing().traceId);
        assertEquals(cancel.getMessage(), newCancel.getMessage());

    }

}