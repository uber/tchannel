package com.uber.tchannel.server;


import com.uber.tchannel.codecs.MessageCodec;
import com.uber.tchannel.codecs.PingHandler;
import com.uber.tchannel.codecs.TFrameCodec;
import com.uber.tchannel.framing.TFrame;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.socket.SocketChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;

public class ServerInitializer extends ChannelInitializer<SocketChannel> {
    @Override
    public void initChannel(SocketChannel ch) throws Exception {
        ch.pipeline().addLast("FrameDecoder", new LengthFieldBasedFrameDecoder(TFrame.MAX_FRAME_LENGTH, 0, 2, -2, 0, true));
        ch.pipeline().addLast("TFrameCodec", new TFrameCodec());
        ch.pipeline().addLast("MessageCodec", new MessageCodec());
        ch.pipeline().addLast("PingHandler", new PingHandler());
        ch.pipeline().addLast("ServerHandler", new ServerHandler());
    }
}
