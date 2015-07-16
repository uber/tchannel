package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.AbstractMessage;
import com.uber.tchannel.messages.InitRequest;
import com.uber.tchannel.messages.MessageType;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.List;

public class MessageCodec extends MessageToMessageCodec<TFrame, AbstractMessage> {

    private final InitRequestCodec initRequestCodec = new InitRequestCodec();

    @Override
    protected void encode(ChannelHandlerContext ctx, AbstractMessage msg, List<Object> out) throws Exception {
        switch (msg.getMessageType()) {
            case InitRequest:
                this.initRequestCodec.encode(ctx, (InitRequest) msg, out);
                break;
            case InitResponse:
                break;
            case Error:
                break;
            default:
                throw new Exception(String.format("Unknown MessageType: %s", msg.getMessageType()));

        }
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {
        MessageType type = MessageType.forValue(frame.type).orElse(MessageType.Error);
        switch (type) {
            case InitRequest:
                this.initRequestCodec.decode(ctx, frame, out);
                break;
            case InitResponse:
                break;
            case Error:
                break;
            default:
                throw new Exception(String.format("Unknown MessageType: %s", type));
        }
    }
}
