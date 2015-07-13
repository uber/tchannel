package com.uber.tchannel.client;

import com.uber.tchannel.codecs.TFrameDecoder;
import com.uber.tchannel.codecs.TFrameEncoder;
import com.uber.tchannel.framing.TFrame;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.socket.SocketChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;

public class ClientInitializer extends ChannelInitializer<SocketChannel> {

    @Override
    public void initChannel(SocketChannel ch) throws Exception {
        // Encoders
        ch.pipeline().addLast("TFrameEncoder", new TFrameEncoder());

        // Decoders
        ch.pipeline().addLast("FrameDecoder", new LengthFieldBasedFrameDecoder(TFrame.MAX_FRAME_LENGTH, 0, 2, -2, 0, true));
        ch.pipeline().addLast("TFrameDecoder", new TFrameDecoder());

        // Handlers
        ch.pipeline().addLast("ClientHandler", new ClientHandler());
    }

}
