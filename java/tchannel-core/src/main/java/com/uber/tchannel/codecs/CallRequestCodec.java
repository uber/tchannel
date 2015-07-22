package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.CallRequest;
import com.uber.tchannel.messages.ChecksumType;
import com.uber.tchannel.tracing.Trace;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.List;
import java.util.Map;

public class CallRequestCodec extends MessageToMessageCodec<TFrame, CallRequest> {

    @Override
    protected void encode(ChannelHandlerContext ctx, CallRequest callRequest, List<Object> out) throws Exception {

    }

    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {
        ByteBuf payload = Unpooled.wrappedBuffer(frame.payload);

        byte flags = payload.readByte();
        long ttl = payload.readUnsignedInt();
        Trace trace = CodecUtils.decodeTrace(payload);
        String service = CodecUtils.decodeSmallString(payload);
        Map<String, String> headers = CodecUtils.decodeSmallHeaders(payload);
        byte checksumType = payload.readByte();
        int checksum = 0;

        ChecksumType type = ChecksumType.fromByte(checksumType).get();
        switch (type) {
            case NoChecksum:
                break;
            case Adler32:
            case FarmhashFingerPrint32:
            case CRC32C:
                checksum = payload.readInt();
                break;
        }

        byte[] arg1 = CodecUtils.decodeArg(payload);
        byte[] arg2 = CodecUtils.decodeArg(payload);
        byte[] arg3 = CodecUtils.decodeArg(payload);

        CallRequest req = new CallRequest(frame.id, flags, ttl, trace, service, headers, checksumType, checksum, arg1, arg2, arg3);
        out.add(req);
    }

}
