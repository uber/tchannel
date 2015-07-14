package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.InitRequest;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class InitRequestCodec extends MessageToMessageCodec<TFrame, InitRequest> {
    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {

        ByteBuf payload = Unpooled.wrappedBuffer(frame.payload);

        int version = payload.readUnsignedShort();
        int numHeaders = payload.readUnsignedShort();

        Map<String, String> headers = HeaderCodec.decodeHeader(numHeaders, payload);

        String hostPort = headers.get(InitRequest.HOST_PORT_KEY);
        String processName = headers.get(InitRequest.PROCESS_NAME_KEY);

        out.add(new InitRequest(frame.id, version, hostPort, processName));
    }

    @Override
    protected void encode(ChannelHandlerContext ctx, InitRequest req, List<Object> out) throws Exception {

        ByteBuf payload = Unpooled.buffer();
        payload.writeShort(req.version);
        payload.writeShort(2);

        Map<String, String> headers = new HashMap<String, String>();
        headers.put(InitRequest.HOST_PORT_KEY, req.hostPort);
        headers.put(InitRequest.PROCESS_NAME_KEY, req.processName);
        HeaderCodec.encodeHeader(headers, payload);

        TFrame frame = new TFrame(req.getMessageType(), req.id, payload.array());
        out.add(frame);
    }
}
