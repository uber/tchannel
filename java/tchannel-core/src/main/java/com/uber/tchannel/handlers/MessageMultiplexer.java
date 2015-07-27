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
package com.uber.tchannel.handlers;

import com.uber.tchannel.messages.AbstractCallMessage;
import com.uber.tchannel.messages.CallRequest;
import com.uber.tchannel.messages.CallRequestContinue;
import com.uber.tchannel.messages.FullMessage;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MessageMultiplexer extends MessageToMessageCodec<AbstractCallMessage, FullMessage> {

    /* Maintains a mapping of MessageId -> Incomplete CallRequest */
    private final Map<Long, FullMessage> messageMap = new HashMap<Long, FullMessage>();

    public Map<Long, FullMessage> getMessageMap() {
        return this.messageMap;
    }

    @Override
    protected void encode(ChannelHandlerContext ctx, FullMessage msg, List<Object> out) throws Exception {
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, AbstractCallMessage msg, List<Object> out) throws Exception {

        long messageId = msg.getId();

        if (msg instanceof CallRequest) {

            CallRequest callRequest = (CallRequest) msg;

            assert this.messageMap.get(messageId) == null;
            this.messageMap.put(messageId, new FullMessage(
                    callRequest.getId(),
                    callRequest.getHeaders(),
                    callRequest.getArg1(),
                    callRequest.getArg2(),
                    callRequest.getArg3()
            ));


        } else if (msg instanceof CallRequestContinue) {

            CallRequestContinue callRequestContinue = (CallRequestContinue) msg;
            assert this.messageMap.get(messageId) != null;

            FullMessage partialFullMessage = this.messageMap.get(messageId);

            FullMessage updatedFullMessage = new FullMessage(
                    partialFullMessage.getId(),
                    partialFullMessage.getHeaders(),
                    Unpooled.wrappedBuffer(partialFullMessage.getArg1(), callRequestContinue.getArg1()),
                    Unpooled.wrappedBuffer(partialFullMessage.getArg2(), callRequestContinue.getArg2()),
                    Unpooled.wrappedBuffer(partialFullMessage.getArg3(), callRequestContinue.getArg3())

            );

            this.messageMap.replace(messageId, updatedFullMessage);


        }

        if (!msg.moreFragmentsRemain()) {
            FullMessage completeFullMessage = this.messageMap.remove(messageId);
            out.add(completeFullMessage);
        }

    }


}
