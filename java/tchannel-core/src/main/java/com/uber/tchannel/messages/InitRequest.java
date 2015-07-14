package com.uber.tchannel.messages;

import com.uber.tchannel.framing.TFrame;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.List;

public class InitRequest extends MessageToMessageCodec<TFrame, TFrame> {

    public static final int DEFAULT_VERSION = 2;

    public final int version;
    public final String hostPort;
    public final String processName;
    public final MessageType messageType = MessageType.InitRequest;

    public InitRequest(int version, String hostPort, String processName) {
        this.version = version;
        this.hostPort = hostPort;
        this.processName = processName;
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {

        ByteBuf payload = Unpooled.wrappedBuffer(frame.payload);

        int version = payload.readUnsignedShort();
        int numheaders = payload.readUnsignedShort();
        String hostPort = "hostPort";
        String processName = "processName";

        out.add(new InitRequest(version, hostPort, processName));
    }
    @Override
    protected void encode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {

    }
}
