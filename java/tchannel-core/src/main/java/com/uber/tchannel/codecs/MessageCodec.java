package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.*;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.List;

public class MessageCodec extends MessageToMessageCodec<TFrame, AbstractMessage> {

    private final InitMessageCodec initMessageCodec = new InitMessageCodec();
    private final PingMessageCodec pingMessageCodec = new PingMessageCodec();

    @Override
    protected void encode(ChannelHandlerContext ctx, AbstractMessage msg, List<Object> out) throws Exception {
        switch (msg.getMessageType()) {
            case InitRequest:
                this.initMessageCodec.encode(ctx, (InitRequest) msg, out);
                break;
            case InitResponse:
                this.initMessageCodec.encode(ctx, (InitResponse) msg, out);
                break;
            case PingRequest:
                this.pingMessageCodec.encode(ctx, (PingRequest) msg, out);
                break;
            case PingResponse:
                this.pingMessageCodec.encode(ctx, (PingResponse) msg, out);
                break;
            default:
                throw new Exception(String.format("Unknown MessageType: %s", msg.getMessageType()));

        }
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {
        MessageType type = MessageType.fromByte(frame.type).orElse(MessageType.None);
        switch (type) {
            case InitRequest:
                this.initMessageCodec.decode(ctx, frame, out);
                break;
            case InitResponse:
                this.initMessageCodec.decode(ctx, frame, out);
                break;
            case PingRequest:
                this.pingMessageCodec.decode(ctx, frame, out);
                break;
            case PingResponse:
                this.pingMessageCodec.decode(ctx, frame, out);
                break;
            default:
                throw new Exception(String.format("Unknown MessageType: %s", type));
        }
    }
}
