package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.Claim;
import com.uber.tchannel.tracing.Trace;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import org.junit.Test;
import static org.junit.Assert.*;

public class ClaimCodecTest {

    @Test
    public void testEncodeDecodeClaim() throws Exception {

        EmbeddedChannel channel = new EmbeddedChannel(
                new LengthFieldBasedFrameDecoder(TFrame.MAX_FRAME_LENGTH, 0, 2, -2, 0, true),
                new TFrameCodec(),
                new ClaimCodec()
        );

        Claim claimMessage = new Claim(Integer.MAX_VALUE, Integer.MAX_VALUE, new Trace(0, 1, 2, (byte) 0x03));

        channel.writeOutbound(claimMessage);
        channel.writeInbound(channel.readOutbound());

        Claim newClaimMessage = channel.readInbound();
        assertEquals(newClaimMessage.getId(), claimMessage.getId());
        assertEquals(newClaimMessage.ttl, claimMessage.ttl);

    }

}