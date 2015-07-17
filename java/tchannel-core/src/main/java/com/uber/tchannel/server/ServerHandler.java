package com.uber.tchannel.server;

import com.uber.tchannel.messages.InitRequest;
import com.uber.tchannel.messages.InitResponse;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerAdapter;
import io.netty.channel.ChannelHandlerContext;

import java.util.concurrent.atomic.AtomicLong;

public class ServerHandler extends ChannelHandlerAdapter {

    private final AtomicLong counter = new AtomicLong(0);

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
        InitRequest initRequest = (InitRequest) msg;
        System.out.println(initRequest);

        InitResponse initResponse = new InitResponse(
                this.counter.incrementAndGet(),
                initRequest.version,
                initRequest.hostPort,
                initRequest.processName
        );

        ChannelFuture f = ctx.writeAndFlush(initResponse);
        f.addListener(ChannelFutureListener.CLOSE);
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        cause.printStackTrace();
        ctx.close();
    }

}