package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.AbstractInitMessage;
import com.uber.tchannel.messages.InitRequest;
import com.uber.tchannel.messages.InitResponse;
import com.uber.tchannel.messages.MessageType;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.HashMap;
import java.util.List;
import java.util.Map;


public class InitMessageCodec extends MessageToMessageCodec<TFrame, AbstractInitMessage> {
    @Override
    protected void encode(ChannelHandlerContext ctx, AbstractInitMessage msg, List<Object> out) throws Exception {

        ByteBuf payload = Unpooled.buffer();
        payload.writeShort(msg.version);

        Map<String, String> headers = new HashMap<String, String>();
        headers.put(AbstractInitMessage.HOST_PORT_KEY, msg.hostPort);
        headers.put(AbstractInitMessage.PROCESS_NAME_KEY, msg.processName);
        CodecUtils.encodeHeaders(headers, payload);

        TFrame frame = new TFrame(msg.getMessageType(), msg.getId(), payload.array());
        out.add(frame);
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {
        ByteBuf payload = Unpooled.wrappedBuffer(frame.payload);

        int version = payload.readUnsignedShort();

        Map<String, String> headers = CodecUtils.decodeHeaders(payload);
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
