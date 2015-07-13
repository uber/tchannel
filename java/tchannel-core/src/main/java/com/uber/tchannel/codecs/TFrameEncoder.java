package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import io.netty.buffer.ByteBuf;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToByteEncoder;

public class TFrameEncoder extends MessageToByteEncoder<TFrame> {
    @Override
    protected void encode(ChannelHandlerContext ctx, TFrame frame, ByteBuf out) throws Exception {
        out.writeShort(frame.size)
                .writeByte(frame.type)
                .writeZero(1)
                .writeInt((int) frame.id)
                .writeZero(8)
                .writeBytes(frame.payload);
    }
}
