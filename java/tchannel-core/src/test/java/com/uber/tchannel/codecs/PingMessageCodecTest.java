package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.PingRequest;
import com.uber.tchannel.messages.PingResponse;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class PingMessageCodecTest {

    @Test
    public void testEncodeDecodePingRequest() throws Exception {
        EmbeddedChannel channel = new EmbeddedChannel(
                new LengthFieldBasedFrameDecoder(TFrame.MAX_FRAME_LENGTH, 0, 2, -2, 0, true),
                new TFrameCodec(),
                new PingMessageCodec()
        );

        PingRequest pingRequest = new PingRequest(42);

        channel.writeOutbound(pingRequest);
        channel.writeInbound(channel.readOutbound());

        PingRequest newPingRequest = channel.readInbound();
        assertEquals(newPingRequest.getId(), pingRequest.getId());

    }

    @Test
    public void testEncodeDecodePingResponse() throws Exception {

        EmbeddedChannel channel = new EmbeddedChannel(
                new LengthFieldBasedFrameDecoder(TFrame.MAX_FRAME_LENGTH, 0, 2, -2, 0, true),
                new TFrameCodec(),
                new PingMessageCodec()
        );

        PingResponse pingResponse = new PingResponse(99);

        channel.writeOutbound(pingResponse);
        channel.writeInbound(channel.readOutbound());

        PingResponse newPingResponse = channel.readInbound();
        assertEquals(newPingResponse.getId(), pingResponse.getId());

    }

}