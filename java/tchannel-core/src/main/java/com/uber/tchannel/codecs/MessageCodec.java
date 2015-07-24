/*
 * Copyright (c) 2015 Uber Technologies, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
package com.uber.tchannel.codecs;

import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.*;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.List;

public class MessageCodec extends MessageToMessageCodec<TFrame, AbstractMessage> {

    private final InitMessageCodec initMessageCodec = new InitMessageCodec();
    private final PingMessageCodec pingMessageCodec = new PingMessageCodec();
    private final CallRequestCodec callRequestCodec = new CallRequestCodec();
    private final ErrorCodec errorCodec = new ErrorCodec();

    @Override
    protected void encode(ChannelHandlerContext ctx, AbstractMessage msg, List<Object> out) throws Exception {
        switch (msg.getMessageType()) {
            case InitRequest:
                this.initMessageCodec.encode(ctx, (InitRequest) msg, out);
                break;
            case InitResponse:
                this.initMessageCodec.encode(ctx, (InitResponse) msg, out);
                break;
            case PingRequest:
                this.pingMessageCodec.encode(ctx, (PingRequest) msg, out);
                break;
            case PingResponse:
                this.pingMessageCodec.encode(ctx, (PingResponse) msg, out);
                break;
            case CallRequest:
                this.callRequestCodec.encode(ctx, (CallRequest) msg, out);
                break;
            case Error:
                this.errorCodec.encode(ctx, (ErrorMessage) msg, out);
                break;
            default:
                throw new Exception(String.format("Unknown MessageType: %s", msg.getMessageType()));

        }
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) throws Exception {
        MessageType type = MessageType.fromByte(frame.type).get();
        switch (type) {
            case InitRequest:
                this.initMessageCodec.decode(ctx, frame, out);
                break;
            case InitResponse:
                this.initMessageCodec.decode(ctx, frame, out);
                break;
            case PingRequest:
                this.pingMessageCodec.decode(ctx, frame, out);
                break;
            case PingResponse:
                this.pingMessageCodec.decode(ctx, frame, out);
                break;
            case CallRequest:
                this.callRequestCodec.decode(ctx, frame, out);
                break;
            case Error:
                this.errorCodec.decode(ctx, frame, out);
                break;
            default:
                throw new Exception(String.format("Unknown MessageType: %s", type));
        }
    }
}
