package com.uber.tchannel.codecs;

/*
 * Copyright (c) 2015 Uber Technologies, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.InitRequest;
import com.uber.tchannel.messages.InitResponse;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class InitMessageCodecTest {

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
        assertEquals(newInitReq.getVersion(), initReq.getVersion());
        assertEquals(newInitReq.getHostPort(), initReq.getHostPort());
        assertEquals(newInitReq.getProcessName(), initReq.getProcessName());

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
        assertEquals(newInitResponse.getVersion(), initResponse.getVersion());
        assertEquals(newInitResponse.getHostPort(), initResponse.getHostPort());
        assertEquals(newInitResponse.getProcessName(), initResponse.getProcessName());

    }

}
