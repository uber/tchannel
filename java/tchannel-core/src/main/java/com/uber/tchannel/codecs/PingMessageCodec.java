package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.*;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.List;

public class PingMessageCodec extends MessageToMessageCodec<TFrame, AbstractPingMessage> {
    @Override
    protected void encode(ChannelHandlerContext ctx, AbstractPingMessage msg, List<Object> out) throws Exception {
        out.add(new TFrame(msg.getMessageType(), msg.getId(), new byte[]{}));
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {
        MessageType type = MessageType.fromByte(frame.type).orElse(MessageType.None);

        AbstractInitMessage msg;
        if (type == MessageType.PingRequest) {
            out.add(new PingRequest(frame.id));
        } else if (type == MessageType.PingResponse) {
            out.add(new PingResponse(frame.id));
        } else {
            throw new RuntimeException(String.format("Unexpected MessageType: %s", frame.type));
        }
    }
}
