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
package com.uber.tchannel.handlers;


import com.uber.tchannel.Fixtures;
import com.uber.tchannel.messages.AbstractCallMessage;
import com.uber.tchannel.messages.CallRequest;
import io.netty.channel.embedded.EmbeddedChannel;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.ExpectedException;

import java.util.Map;
import java.util.Queue;

import static org.junit.Assert.*;

public class TestMessageMultiplexer {

    @Rule
    public final ExpectedException expectedAssertionError = ExpectedException.none();

    @Test
    public void testQueue() {
        MessageMultiplexer mux = new MessageMultiplexer();
        Map<Long, Queue<AbstractCallMessage>> map = mux.getMessageMap();
        EmbeddedChannel channel = new EmbeddedChannel(mux);

        channel.writeInbound(Fixtures.callRequestWithIdAndMoreFragments(0));
        Queue<AbstractCallMessage> queue = map.get(0L);
        assertNotNull(queue);
        assertEquals(queue.size(), 1);

        channel.writeInbound(Fixtures.callRequestContinueWithIdAndMoreFragments(0));
        assertNotNull(queue);
        assertEquals(queue.size(), 2);

        channel.writeInbound(Fixtures.callRequestContinueWithId(0));
        assertNull(map.get(0L));

        CallRequest fullCallRequest = channel.readInbound();
        assertArrayEquals(fullCallRequest.arg1, new byte[]{0x01, 0x01, 0x01});
        assertArrayEquals(fullCallRequest.arg2, new byte[]{0x02, 0x02, 0x02});
        assertArrayEquals(fullCallRequest.arg3, new byte[]{0x03, 0x03, 0x03});

    }

    @Test
    public void testInvalidQueue() {
        MessageMultiplexer mux = new MessageMultiplexer();
        EmbeddedChannel channel = new EmbeddedChannel(mux);

        channel.writeInbound(Fixtures.callRequestWithIdAndMoreFragments(0));
        this.expectedAssertionError.expect(AssertionError.class);
        channel.writeInbound(Fixtures.callRequestWithId(0));

    }

    @Test
    public void testCallRequestWithSameId() {
        MessageMultiplexer mux = new MessageMultiplexer();
        EmbeddedChannel channel = new EmbeddedChannel(mux);

        channel.writeInbound(Fixtures.callRequestWithId(0));
        channel.writeInbound(Fixtures.callRequestWithId(0));
        channel.writeInbound(Fixtures.callRequestWithId(0));

        assertNotNull(channel.readInbound());
        assertNotNull(channel.readInbound());
        assertNotNull(channel.readInbound());
        assertNull(channel.readInbound());

    }

    @Test
    public void testAddUnknownCallRequestContinue() {

        MessageMultiplexer mux = new MessageMultiplexer();
        EmbeddedChannel channel = new EmbeddedChannel(mux);
        this.expectedAssertionError.expect(AssertionError.class);
        channel.writeInbound(Fixtures.callRequestContinueWithId(0));

    }

}
