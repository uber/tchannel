package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.Cancel;
import com.uber.tchannel.messages.MessageType;
import com.uber.tchannel.tracing.Trace;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.List;

public class CancelCodec extends MessageToMessageCodec<TFrame, Cancel> {
    @Override
    protected void encode(ChannelHandlerContext ctx, Cancel msg, List<Object> out) throws Exception {

        ByteBuf buffer = ctx.alloc().heapBuffer();
        buffer.writeInt((int) msg.ttl);
        CodecUtils.encodeTrace(msg.tracing, buffer);
        CodecUtils.encodeString(msg.why, buffer);
        TFrame frame = new TFrame(buffer.writerIndex(), MessageType.Cancel, msg.getId(), buffer);
        out.add(frame);

    }

    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {

        ByteBuf payload = Unpooled.wrappedBuffer(frame.payload);
        long ttl = payload.readUnsignedInt();
        Trace tracing = CodecUtils.decodeTrace(payload);
        String why = CodecUtils.decodeString(payload);
        Cancel cancel = new Cancel(frame.id, ttl, tracing, why);

    }
}
