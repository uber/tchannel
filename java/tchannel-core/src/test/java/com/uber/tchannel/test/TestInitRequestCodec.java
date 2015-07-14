package com.uber.tchannel.test;

import com.uber.tchannel.codecs.InitRequestCodec;
import com.uber.tchannel.codecs.TFrameCodec;
import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.InitRequest;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class TestInitRequestCodec {

    @Test
    public void shouldEncodeAndDecodeInitReq() {

        EmbeddedChannel channel = new EmbeddedChannel(
                new LengthFieldBasedFrameDecoder(TFrame.MAX_FRAME_LENGTH, 0, 2, -2, 0, true),
                new TFrameCodec(),
                new InitRequestCodec()
        );

        InitRequest initReq = new InitRequest(42, InitRequest.DEFAULT_VERSION, "0.0.0.0:0", "test-process");

        channel.writeOutbound(initReq);
        channel.writeInbound(channel.readOutbound());

        InitRequest newInitReq = channel.readInbound();
        assertEquals(newInitReq.id, initReq.id);
        assertEquals(newInitReq.version, initReq.version);
        assertEquals(newInitReq.hostPort, initReq.hostPort);
        assertEquals(newInitReq.processName, initReq.processName);

    }

}
