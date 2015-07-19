package com.uber.tchannel.handlers;

import com.uber.tchannel.messages.PingRequest;
import com.uber.tchannel.messages.PingResponse;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;


public class PingHandler extends SimpleChannelInboundHandler<PingRequest> {

    @Override
    protected void messageReceived(ChannelHandlerContext ctx, PingRequest msg) throws Exception {
        ctx.writeAndFlush(new PingResponse(msg.getId()));
    }
}
