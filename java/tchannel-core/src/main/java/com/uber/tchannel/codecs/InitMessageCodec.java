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
package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.AbstractInitMessage;
import com.uber.tchannel.messages.InitRequest;
import com.uber.tchannel.messages.InitResponse;
import com.uber.tchannel.messages.MessageType;
import io.netty.buffer.ByteBuf;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.HashMap;
import java.util.List;
import java.util.Map;


public class InitMessageCodec extends MessageToMessageCodec<TFrame, AbstractInitMessage> {
    @Override
    protected void encode(ChannelHandlerContext ctx, AbstractInitMessage msg, List<Object> out) throws Exception {

        // Allocate new ByteBuf
        ByteBuf buffer = ctx.alloc().buffer();

        // version:2
        buffer.writeShort(msg.getVersion());

        // nh:2 (key~2 value~2){nh}
        Map<String, String> headers = new HashMap<String, String>();
        headers.put(AbstractInitMessage.HOST_PORT_KEY, msg.getHostPort());
        headers.put(AbstractInitMessage.PROCESS_NAME_KEY, msg.getProcessName());
        CodecUtils.encodeHeaders(headers, buffer);

        TFrame frame = new TFrame(buffer.writerIndex(), msg.getMessageType(), msg.getId(), buffer);
        out.add(frame);
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {

        int version = frame.payload.readUnsignedShort();

        Map<String, String> headers = CodecUtils.decodeHeaders(frame.payload);
        String hostPort = headers.get(AbstractInitMessage.HOST_PORT_KEY);
        String processName = headers.get(AbstractInitMessage.PROCESS_NAME_KEY);

        MessageType type = MessageType.fromByte(frame.type).get();

        switch (type) {
            case InitRequest:
                out.add(new InitRequest(frame.id, version, hostPort, processName));
                break;
            case InitResponse:
                out.add(new InitResponse(frame.id, version, hostPort, processName));
                break;
        }


    }

}
