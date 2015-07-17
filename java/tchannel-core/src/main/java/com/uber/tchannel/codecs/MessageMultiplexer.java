package com.uber.tchannel.codecs;

import com.uber.tchannel.messages.*;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.*;

public class MessageMultiplexer extends MessageToMessageCodec<Message, FullMessage> {

    private final Map<Long, Queue<Message>> messageMap = new HashMap<Long, Queue<Message>>();

    public Map<Long, Queue<Message>> getMessageMap() {
        return this.messageMap;
    }

    @Override
    protected void encode(ChannelHandlerContext ctx, FullMessage message, List<Object> out) throws Exception {
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, Message message, List<Object> out) throws Exception {

        this.messageMap.putIfAbsent(message.getId(), new LinkedList<Message>());
        this.messageMap.get(message.getId()).add(message);

    }

    @Override
    public boolean acceptInboundMessage(Object msg) throws Exception {
        return (msg instanceof CallRequest || msg instanceof CallRequestContinue);
    }

    @Override
    public boolean acceptOutboundMessage(Object msg) throws Exception {
        return (msg instanceof CallResponse || msg instanceof CallResponseContinue);
    }
}
