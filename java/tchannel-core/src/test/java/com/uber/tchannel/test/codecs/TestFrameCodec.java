package com.uber.tchannel.test.codecs;

import com.uber.tchannel.codecs.TFrameCodec;
import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.MessageType;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import org.junit.Test;

import static org.junit.Assert.*;


public class TestFrameCodec {

    @Test
    public void shouldEncodeAndDecodeFrame() {

        EmbeddedChannel channel = new EmbeddedChannel(
                new LengthFieldBasedFrameDecoder(TFrame.MAX_FRAME_LENGTH, 0, 2, -2, 0, true),
                new TFrameCodec()
        );

        String payload = "Hello, World!";
        ByteBuf buffer = Unpooled.wrappedBuffer(payload.getBytes());

        TFrame frame = new TFrame(
                payload.getBytes().length,
                MessageType.InitRequest,
                Integer.MAX_VALUE,
                buffer
        );

        channel.writeOutbound(frame);
        channel.writeInbound(channel.readOutbound());

        TFrame newFrame = channel.readInbound();
        assertNotNull(newFrame);
        assertEquals(frame.size, newFrame.size);
        assertEquals(frame.type, newFrame.type);
        assertEquals(frame.id, newFrame.id);

    }

}