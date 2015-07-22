package com.uber.tchannel.handlers;

import com.uber.tchannel.messages.*;
import com.uber.tchannel.messages.Error;
import com.uber.tchannel.tracing.Trace;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerAdapter;
import io.netty.channel.ChannelHandlerContext;

public class InitRequestHandler extends ChannelHandlerAdapter {


    @Override
    public void channelRead(ChannelHandlerContext ctx, Object object) throws Exception {

        AbstractMessage message = (AbstractMessage) object;

        switch (message.getMessageType()) {

            case InitRequest:
                InitRequest initRequestMessage = (InitRequest) message;

                if (initRequestMessage.version == AbstractInitMessage.DEFAULT_VERSION) {
                    ctx.writeAndFlush(new InitResponse(
                            initRequestMessage.getId(),
                            AbstractInitMessage.DEFAULT_VERSION,
                            initRequestMessage.hostPort,
                            initRequestMessage.processName
                    ));
                    ctx.pipeline().remove(this);
                } else {
                    ChannelFuture versionErrorFuture = ctx.writeAndFlush(new Error(
                            message.getId(),
                            Error.ErrorType.FatalProtocolError.byteValue(),
                            new Trace(0, 0, 0, (byte) 0x00),
                            String.format("Expected Protocol version: %d", AbstractInitMessage.DEFAULT_VERSION)
                    ));
                    versionErrorFuture.addListener(ChannelFutureListener.CLOSE);
                }

                break;

            default:
                ChannelFuture protocolErrorFuture = ctx.writeAndFlush(new Error(
                        message.getId(),
                        Error.ErrorType.FatalProtocolError.byteValue(),
                        new Trace(0, 0, 0, (byte) 0x00),
                        "Must not send any data until receiving Init Request"
                ));
                protocolErrorFuture.addListener(ChannelFutureListener.CLOSE);
                break;

        }
    }


}
