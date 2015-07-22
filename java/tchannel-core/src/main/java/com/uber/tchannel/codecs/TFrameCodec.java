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
import io.netty.buffer.ByteBuf;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.ByteToMessageCodec;

import java.util.List;

public class TFrameCodec extends ByteToMessageCodec<TFrame> {

    @Override
    protected void encode(ChannelHandlerContext ctx, TFrame frame, ByteBuf out) throws Exception {
        out.writeShort(frame.size + TFrame.FRAME_HEADER_LENGTH)
                .writeByte(frame.type)
                .writeZero(1)
                .writeInt((int) frame.id)
                .writeZero(8)
                .writeBytes(frame.payload);
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, ByteBuf msg, List<Object> out) throws Exception {

        // size:2
        int size = msg.readUnsignedShort() - TFrame.FRAME_HEADER_LENGTH;

        // type:1
        byte type = msg.readByte();

        // reserved:1
        msg.skipBytes(1);

        // id:4
        long id = msg.readUnsignedInt();

        // reserved:8
        msg.skipBytes(8);

        // payload:16+
        ByteBuf payload = msg.readSlice(size);
        payload.retain();

        out.add(new TFrame(size, type, id, payload));

    }
}
