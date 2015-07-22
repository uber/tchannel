package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.Claim;
import com.uber.tchannel.tracing.Trace;
import io.netty.buffer.ByteBuf;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.List;

public class ClaimCodec extends MessageToMessageCodec<TFrame, Claim> {
    @Override
    protected void encode(ChannelHandlerContext ctx, Claim msg, List<Object> out) throws Exception {
        ByteBuf buffer = ctx.alloc().buffer(Trace.TRACING_HEADER_LENGTH + Integer.BYTES); // Tracing + TTL

        // ttl: 4
        buffer.writeInt((int) msg.ttl);

        // tracing: 25
        CodecUtils.encodeTrace(msg.tracing, buffer);

        out.add(new TFrame(buffer.writerIndex(), msg.getMessageType(), msg.getId(), buffer));
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {
        // ttl: 4
        long ttl = frame.payload.readUnsignedInt();

        // tracing: 25
        Trace tracing = CodecUtils.decodeTrace(frame.payload);

        out.add(new Claim(frame.id, ttl, tracing));
    }
}
