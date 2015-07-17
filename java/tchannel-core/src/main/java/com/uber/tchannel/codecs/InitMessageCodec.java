package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.InitMessage;
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


public class InitMessageCodec extends MessageToMessageCodec<TFrame, InitMessage> {
    @Override
    protected void encode(ChannelHandlerContext ctx, InitMessage msg, List<Object> out) throws Exception {

        ByteBuf payload = Unpooled.buffer();
        payload.writeShort(msg.version);
        payload.writeShort(2);

        Map<String, String> headers = new HashMap<String, String>();
        headers.put(InitMessage.HOST_PORT_KEY, msg.hostPort);
        headers.put(InitMessage.PROCESS_NAME_KEY, msg.processName);
        HeaderUtils.encodeHeader(headers, payload);

        TFrame frame = new TFrame(msg.getMessageType(), msg.getId(), payload.array());
        out.add(frame);
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {
        ByteBuf payload = Unpooled.wrappedBuffer(frame.payload);

        int version = payload.readUnsignedShort();
        int numHeaders = payload.readUnsignedShort();

        Map<String, String> headers = HeaderUtils.decodeHeader(numHeaders, payload);
        String hostPort = headers.get(InitMessage.HOST_PORT_KEY);
        String processName = headers.get(InitMessage.PROCESS_NAME_KEY);

        MessageType type = MessageType.fromByte(frame.type).orElse(MessageType.None);

        InitMessage msg;
        if (type == MessageType.InitRequest) {
            out.add(new InitRequest(frame.id, version, hostPort, processName));
        } else if (type == MessageType.InitResponse) {
            out.add(new InitResponse(frame.id, version, hostPort, processName));
        } else {
            throw new RuntimeException(String.format("Unexpected MessageType: %s", frame.type));
        }

    }

}
