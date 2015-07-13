package com.uber.tchannel.client;

import com.uber.tchannel.framing.TFrame;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerAdapter;
import io.netty.channel.ChannelHandlerContext;

public class ServerHandler extends ChannelHandlerAdapter {

    @Override
    public void channelActive(ChannelHandlerContext ctx) {
        ChannelFuture f = ctx.writeAndFlush(new TFrame(Byte.MAX_VALUE, Integer.MAX_VALUE, "Hello, World!".getBytes()));
        f.addListener(ChannelFutureListener.CLOSE);
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        cause.printStackTrace();
        ctx.close();
    }

}