package com.uber.tchannel.test;

import com.uber.tchannel.codecs.TFrameDecoder;
import com.uber.tchannel.codecs.TFrameEncoder;
import com.uber.tchannel.framing.TFrame;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import org.junit.Test;

import static org.junit.Assert.*;


public class TestFrameCodecPipeline  {

    @Test
    public void shouldEncodeAndDecodeFrame() {

        EmbeddedChannel channel = new EmbeddedChannel(
                new TFrameEncoder(),
                new LengthFieldBasedFrameDecoder(TFrame.MAX_FRAME_LENGTH, 0, 2, -2, 0, true),
                new TFrameDecoder()
        );

        String payload = "Hello, World!";
        TFrame frame = new TFrame((byte)0x1, Integer.MAX_VALUE, payload.getBytes());

        channel.writeOutbound(frame);
        channel.writeInbound(channel.readOutbound());

        TFrame newFrame = channel.readInbound();
        assertNotNull(newFrame);
        assertEquals(frame.size, newFrame.size);
        assertEquals(frame.type, newFrame.type);
        assertEquals(frame.id, newFrame.id);
        assertArrayEquals(frame.payload, newFrame.payload);

        assertEquals(payload, new String(newFrame.payload));

    }

}