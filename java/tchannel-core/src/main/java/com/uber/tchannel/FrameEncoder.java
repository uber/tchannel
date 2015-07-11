package com.uber.tchannel;

import io.netty.buffer.ByteBuf;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToByteEncoder;

public class FrameEncoder extends MessageToByteEncoder<Frame> {
    @Override
    protected void encode(ChannelHandlerContext ctx, Frame frame, ByteBuf out) throws Exception {
        out.writeShort(frame.size);
        out.writeByte(frame.type);
        out.writeZero(1);
        out.writeInt((int)frame.id);
        out.writeZero(8);
        out.writeBytes(frame.payload);
    }
}
