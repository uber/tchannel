package com.uber.tchannel.test.codecs;

import com.uber.tchannel.codecs.CancelCodec;
import com.uber.tchannel.messages.Cancel;
import com.uber.tchannel.tracing.Trace;
import io.netty.channel.embedded.EmbeddedChannel;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class CancelCodecTest {

    @Test
    public void testEncodeDecode() throws Exception {

        EmbeddedChannel channel = new EmbeddedChannel(
                new CancelCodec()
        );

        Cancel cancel = new Cancel(Long.MAX_VALUE, Long.MAX_VALUE, new Trace(0, 1, 2, (byte) 0x03), "Whoopsies");

        channel.writeInbound(cancel);
        Cancel newCancel = (Cancel) channel.readInbound();
        assertEquals(cancel.getId(), newCancel.getId());
        assertEquals(cancel.ttl, newCancel.ttl);
        assertTrue(newCancel.ttl > 0);
        assertEquals(cancel.tracing.traceId, newCancel.tracing.traceId);
        assertEquals(cancel.why, newCancel.why);

    }

}