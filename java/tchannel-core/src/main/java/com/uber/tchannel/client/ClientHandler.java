package com.uber.tchannel.client;

import com.uber.tchannel.messages.InitRequest;
import io.netty.channel.ChannelHandlerAdapter;
import io.netty.channel.ChannelHandlerContext;

public class ClientHandler extends ChannelHandlerAdapter {

    @Override
    public void channelActive(ChannelHandlerContext ctx) throws Exception {

        InitRequest initRequest = new InitRequest(42, InitRequest.DEFAULT_VERSION, "0.0.0.0:0", "test-process");
        System.out.println(initRequest);
        ctx.writeAndFlush(initRequest);
    }

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) {
        InitRequest initRequest = (InitRequest) msg;
        System.out.println(initRequest);
        ctx.close();
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        cause.printStackTrace();
        ctx.close();
    }

}
