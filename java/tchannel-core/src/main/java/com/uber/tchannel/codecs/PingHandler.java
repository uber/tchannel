package com.uber.tchannel.codecs;

import com.uber.tchannel.messages.Message;
import com.uber.tchannel.messages.MessageType;
import com.uber.tchannel.messages.PingResponse;
import io.netty.channel.ChannelHandlerAdapter;
import io.netty.channel.ChannelHandlerContext;

public class PingHandler extends ChannelHandlerAdapter {

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {

        Message message = (Message) msg;
        if (message.getMessageType() == MessageType.PingRequest) {
            ctx.writeAndFlush(new PingResponse(message.getId()));
        }
        ctx.fireChannelRead(msg);

    }

}
