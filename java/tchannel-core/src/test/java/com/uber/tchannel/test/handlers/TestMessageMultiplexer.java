package com.uber.tchannel.test.handlers;


import com.uber.tchannel.handlers.MessageMultiplexer;
import com.uber.tchannel.messages.AbstractCallMessage;
import com.uber.tchannel.test.Fixtures;
import io.netty.channel.embedded.EmbeddedChannel;
import org.junit.Test;

import java.util.Map;
import java.util.Queue;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

public class TestMessageMultiplexer {

    @Test
    public void testQueue() {
        MessageMultiplexer mux = new MessageMultiplexer();

        EmbeddedChannel channel = new EmbeddedChannel(mux);

        channel.writeInbound(Fixtures.callRequestWithId(0));
        channel.writeInbound(Fixtures.callRequestWithId(0));
        channel.writeInbound(Fixtures.callRequestWithId(1));

        Map<Long, Queue<AbstractCallMessage>> map = mux.getMessageMap();
        assertNotNull(map);

        Queue<AbstractCallMessage> lst0 = map.get(0L);
        assertNotNull(lst0);
        assertEquals(lst0.size(), 2);

        Queue<AbstractCallMessage> lst1 = map.get(1L);
        assertNotNull(lst1);
        assertEquals(lst1.size(), 1);
    }
}
