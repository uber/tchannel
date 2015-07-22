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
        buffer.writeShort(msg.version);

        // nh:2 (key~2 value~2){nh}
        Map<String, String> headers = new HashMap<String, String>();
        headers.put(AbstractInitMessage.HOST_PORT_KEY, msg.hostPort);
        headers.put(AbstractInitMessage.PROCESS_NAME_KEY, msg.processName);
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
            case InitResponse:
                out.add(new InitResponse(frame.id, version, hostPort, processName));
        }


    }

}
