package com.uber.tchannel.test.handlers;

import com.uber.tchannel.codecs.MessageCodec;
import com.uber.tchannel.handlers.PingHandler;
import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.MessageType;
import io.netty.channel.embedded.EmbeddedChannel;
import org.junit.Test;

import static org.junit.Assert.*;

public class TestPingResponse {

    @Test
    public void shouldInterceptPing() {

        EmbeddedChannel channel = new EmbeddedChannel(
                new MessageCodec(),
                new PingHandler()
        );

        TFrame frame = new TFrame(MessageType.PingRequest.byteValue(), Integer.MAX_VALUE, new byte[]{});

        channel.writeInbound(frame);
        TFrame newFrame = channel.readOutbound();

        assertNotNull(newFrame);
        assertEquals(frame.size, newFrame.size);
        assertEquals(MessageType.PingResponse.byteValue(), newFrame.type);
        assertEquals(frame.id, newFrame.id);

    }

}
