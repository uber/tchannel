package com.uber.tchannel.test;

import com.uber.tchannel.Frame;
import com.uber.tchannel.FrameDecoder;
import com.uber.tchannel.FrameEncoder;
import io.netty.channel.embedded.EmbeddedChannel;

import org.junit.Test;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;


public class TestFrameCodecPipeline  {

    @Test
    public void shouldEncodeAndDecodeFrame() {
        EmbeddedChannel channel = new EmbeddedChannel( new FrameEncoder(), new FrameDecoder() );

        Frame frame = new Frame(16, (byte)0x1, 42, new byte[]{0x00,0x01,0x02,0x03});

        channel.writeOutbound(frame);
        channel.writeInbound(channel.readOutbound());

        Frame newFrame = (Frame) channel.readInbound();
        assertNotNull(newFrame);
        assertEquals(frame.size, newFrame.size);
        assertEquals(frame.type, newFrame.type);
        assertEquals(frame.id, newFrame.id);
        assertEquals(frame.payload, newFrame.payload);
    }
}