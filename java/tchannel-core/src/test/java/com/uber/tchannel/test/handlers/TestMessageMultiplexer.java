package com.uber.tchannel.test.handlers;


import com.uber.tchannel.handlers.MessageMultiplexer;
import com.uber.tchannel.messages.AbstractCallMessage;
import com.uber.tchannel.messages.CallRequest;
import com.uber.tchannel.test.Fixtures;
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

        CallRequest fullCallRequest = (CallRequest) channel.readInbound();
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
    public void testCallRequestWithSameId(){
        MessageMultiplexer mux = new MessageMultiplexer();
        EmbeddedChannel channel = new EmbeddedChannel(mux);

        channel.writeInbound(Fixtures.callRequestWithId(0));
        channel.writeInbound(Fixtures.callRequestWithId(0));
        channel.writeInbound(Fixtures.callRequestWithId(0));

        assertNotNull((CallRequest) channel.readInbound());
        assertNotNull((CallRequest) channel.readInbound());
        assertNotNull((CallRequest) channel.readInbound());
        assertNull((CallRequest) channel.readInbound());

    }

    @Test
    public void testAddUnknownCallRequestContinue() {

        MessageMultiplexer mux = new MessageMultiplexer();
        EmbeddedChannel channel = new EmbeddedChannel(mux);
        this.expectedAssertionError.expect(AssertionError.class);
        channel.writeInbound(Fixtures.callRequestContinueWithId(0));

    }

}
