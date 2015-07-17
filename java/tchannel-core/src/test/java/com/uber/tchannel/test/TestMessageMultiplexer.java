package com.uber.tchannel.test;


import com.uber.tchannel.codecs.MessageMultiplexer;
import com.uber.tchannel.messages.CallRequest;
import com.uber.tchannel.messages.Message;
import io.netty.channel.embedded.EmbeddedChannel;
import org.junit.Test;

import java.util.Queue;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

public class TestMessageMultiplexer {

    @Test
    public void testQueue(){
        MessageMultiplexer mux = new MessageMultiplexer();

        EmbeddedChannel channel = new EmbeddedChannel(mux);

        channel.writeInbound(new CallRequest(0));
        channel.writeInbound(new CallRequest(0));
        channel.writeInbound(new CallRequest(1));

        Map<Long, Queue<Message>> map = mux.getMessageMap();
        assertNotNull(map);

        Queue<Message> lst0 = map.get(0L);
        assertNotNull(lst0);
        assertEquals(lst0.size(), 2);

        Queue<Message> lst1 = map.get(1L);
        assertNotNull(lst1);
        assertEquals(lst1.size(), 1);
    }
}
