package com.uber.tchannel.handlers;

import com.uber.tchannel.messages.*;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.*;

public class MessageMultiplexer extends MessageToMessageCodec<AbstractMessage, FullMessage> {

    private final Map<Long, Queue<AbstractMessage>> messageMap = new HashMap<Long, Queue<AbstractMessage>>();

    public Map<Long, Queue<AbstractMessage>> getMessageMap() {
        return this.messageMap;
    }

    @Override
    protected void encode(ChannelHandlerContext ctx, FullMessage msg, List<Object> out) throws Exception {
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, AbstractMessage msg, List<Object> out) throws Exception {

        this.messageMap.putIfAbsent(msg.getId(), new LinkedList<AbstractMessage>());
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
