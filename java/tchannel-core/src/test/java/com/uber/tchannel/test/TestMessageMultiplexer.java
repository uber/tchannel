package com.uber.tchannel.test;


import com.uber.tchannel.handlers.MessageMultiplexer;
import com.uber.tchannel.messages.AbstractMessage;
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

        Map<Long, Queue<AbstractMessage>> map = mux.getMessageMap();
        assertNotNull(map);

        Queue<AbstractMessage> lst0 = map.get(0L);
        assertNotNull(lst0);
        assertEquals(lst0.size(), 2);

        Queue<AbstractMessage> lst1 = map.get(1L);
        assertNotNull(lst1);
        assertEquals(lst1.size(), 1);
    }
}
