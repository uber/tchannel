package com.uber.tchannel.client;

import com.uber.tchannel.framing.TFrame;
import io.netty.channel.ChannelHandlerAdapter;
import io.netty.channel.ChannelHandlerContext;

public class ClientHandler extends ChannelHandlerAdapter {

    @Override
    public void channelActive(ChannelHandlerContext ctx) throws Exception {
        TFrame frame = new TFrame((byte) 0x1, 42, "Hi?".getBytes());
        System.out.println(frame);
        ctx.writeAndFlush(frame);
    }

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) {
        TFrame frame = (TFrame) msg;
        System.out.println(frame);
        ctx.close();

    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        cause.printStackTrace();
        ctx.close();
    }

}
