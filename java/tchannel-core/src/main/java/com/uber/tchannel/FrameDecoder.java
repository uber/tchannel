package com.uber.tchannel;

import io.netty.buffer.ByteBuf;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;

public class FrameDecoder extends LengthFieldBasedFrameDecoder {

    public static final int MAX_FRAME_LENGTH = 65536;
    public static final int FRAME_HEADER_LENGTH = 16;

    public FrameDecoder() {
        super(MAX_FRAME_LENGTH, 0, 2, -2, 0, true);
    }

    @Override
    protected Object decode(ChannelHandlerContext ctx, ByteBuf in) throws Exception {


        int size = in.readUnsignedShort();
        byte type = in.readByte();
        in.skipBytes(1);
        long id = in.readUnsignedInt();
        in.skipBytes(8);
        byte[] payload = new byte[size - FRAME_HEADER_LENGTH];
        in.readBytes(payload);

        return new Frame(size, type, id, payload);


    }
}
