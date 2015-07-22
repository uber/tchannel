package com.uber.tchannel.test.codecs;

import com.uber.tchannel.codecs.InitMessageCodec;
import com.uber.tchannel.codecs.TFrameCodec;
import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.InitRequest;
import com.uber.tchannel.messages.InitResponse;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class TestInitMessageCodec {

    @Test
    public void shouldEncodeAndDecodeInitRequest() {

        EmbeddedChannel channel = new EmbeddedChannel(
                new LengthFieldBasedFrameDecoder(TFrame.MAX_FRAME_LENGTH, 0, 2, -2, 0, true),
                new TFrameCodec(),
                new InitMessageCodec()
        );

        InitRequest initReq = new InitRequest(42, InitRequest.DEFAULT_VERSION, "0.0.0.0:0", "test-process");

        channel.writeOutbound(initReq);
        channel.writeInbound(channel.readOutbound());

        InitRequest newInitReq = channel.readInbound();
        assertEquals(newInitReq.getMessageType(), initReq.getMessageType());
        assertEquals(newInitReq.getId(), initReq.getId());
        assertEquals(newInitReq.version, initReq.version);
        assertEquals(newInitReq.hostPort, initReq.hostPort);
        assertEquals(newInitReq.processName, initReq.processName);

    }

    @Test
    public void shouldEncodeAndDecodeInitResponse() {

        EmbeddedChannel channel = new EmbeddedChannel(
                new LengthFieldBasedFrameDecoder(TFrame.MAX_FRAME_LENGTH, 0, 2, -2, 0, true),
                new TFrameCodec(),
                new InitMessageCodec()
        );

        InitResponse initResponse = new InitResponse(42, InitRequest.DEFAULT_VERSION, "0.0.0.0:0", "test-process");

        channel.writeOutbound(initResponse);
        channel.writeInbound(channel.readOutbound());

        InitResponse newInitResponse = channel.readInbound();
        assertEquals(newInitResponse.getMessageType(), initResponse.getMessageType());
        assertEquals(newInitResponse.getId(), initResponse.getId());
        assertEquals(newInitResponse.version, initResponse.version);
        assertEquals(newInitResponse.hostPort, initResponse.hostPort);
        assertEquals(newInitResponse.processName, initResponse.processName);

    }

}
