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
