package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import io.netty.buffer.ByteBuf;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.ByteToMessageCodec;

import java.util.List;

/**
 * Created by wjs on 7/13/15.
 */
public class TFrameCodec extends ByteToMessageCodec<TFrame> {
    @Override
    protected void encode(ChannelHandlerContext ctx, TFrame frame, ByteBuf out) throws Exception {
        out.writeShort(frame.size)
                .writeByte(frame.type)
                .writeZero(1)
                .writeInt((int) frame.id)
                .writeZero(8)
                .writeBytes(frame.payload);
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, ByteBuf msg, List<Object> out) throws Exception {

        // size:2
        int size = msg.readUnsignedShort();

        // type:1
        byte type = msg.readByte();

        // reserved:1
        msg.skipBytes(1);

        // id:4
        long id = msg.readUnsignedInt();

        // reserved:8
        msg.skipBytes(8);

        // payload:16+
        byte[] payload = new byte[size - TFrame.FRAME_HEADER_LENGTH];
        msg.readBytes(payload);

        out.add(new TFrame(type, id, payload));

    }
}
