package com.uber.tchannel.handlers;

import com.uber.tchannel.messages.*;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.*;

public class MessageMultiplexer extends MessageToMessageCodec<AbstractCallMessage, FullMessage> {

    private final Map<Long, Queue<AbstractCallMessage>> messageMap = new HashMap<Long, Queue<AbstractCallMessage>>();

    public Map<Long, Queue<AbstractCallMessage>> getMessageMap() {
        return this.messageMap;
    }

    @Override
    protected void encode(ChannelHandlerContext ctx, FullMessage msg, List<Object> out) throws Exception {
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, AbstractCallMessage msg, List<Object> out) throws Exception {

        this.messageMap.putIfAbsent(msg.getId(), new LinkedList<AbstractCallMessage>());
        this.messageMap.get(msg.getId()).add(msg);

    }

    @Override
    public boolean acceptOutboundMessage(Object msg) throws Exception {
        return (msg instanceof CallResponse || msg instanceof CallResponseContinue);
    }

    @Override
    public boolean acceptInboundMessage(Object msg) throws Exception {
        return (msg instanceof CallRequest || msg instanceof CallRequestContinue);
    }

}
