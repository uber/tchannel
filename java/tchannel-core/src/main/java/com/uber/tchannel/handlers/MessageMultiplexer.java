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

import com.uber.tchannel.messages.*;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;
import io.netty.util.ReferenceCountUtil;

import java.io.ByteArrayOutputStream;
import java.util.*;

public class MessageMultiplexer extends MessageToMessageCodec<AbstractCallMessage, CallRequest> {

    private final Map<Long, Queue<AbstractCallMessage>> messageMap = new HashMap<Long, Queue<AbstractCallMessage>>();

    public Map<Long, Queue<AbstractCallMessage>> getMessageMap() {
        return this.messageMap;
    }

    private CallRequest combineQueuedMessages(Queue<AbstractCallMessage> messageQueue) throws Exception {
        // Pop Call Request off the Queue
        CallRequest callRequest = (CallRequest) messageQueue.poll();

        // Recurse through the queue and aggregate
        while (!messageQueue.isEmpty()) {
            CallRequestContinue callRequestContinue = (CallRequestContinue) messageQueue.poll();
            ByteArrayOutputStream os1 = new ByteArrayOutputStream(callRequest.arg1.length + callRequestContinue.arg1.length);
            os1.write(callRequest.arg1);
            os1.write(callRequestContinue.arg1);
            callRequest.arg1 = os1.toByteArray();

            ByteArrayOutputStream os2 = new ByteArrayOutputStream(callRequest.arg2.length + callRequestContinue.arg2.length);
            os2.write(callRequest.arg2);
            os2.write(callRequestContinue.arg2);
            callRequest.arg2 = os2.toByteArray();

            ByteArrayOutputStream os3 = new ByteArrayOutputStream(callRequest.arg3.length + callRequestContinue.arg3.length);
            os3.write(callRequest.arg3);
            os3.write(callRequestContinue.arg3);
            callRequest.arg3 = os3.toByteArray();

            ReferenceCountUtil.release(callRequestContinue);
        }

        return callRequest;
    }

    @Override
    protected void encode(ChannelHandlerContext ctx, CallRequest msg, List<Object> out) throws Exception {
    }

    @Override
    protected void decode(ChannelHandlerContext ctx, AbstractCallMessage msg, List<Object> out) throws Exception {

        long messageId = msg.getId();

        if (msg instanceof CallRequest) {

            assert this.messageMap.get(messageId) == null;
            this.messageMap.put(messageId, new LinkedList<AbstractCallMessage>());
            this.messageMap.get(messageId).add(msg);

        } else if (msg instanceof CallRequestContinue) {

            assert this.messageMap.get(messageId) != null;
            this.messageMap.get(messageId).add(msg);

        }

        if (!msg.moreFragmentsRemain()) {
            out.add(this.combineQueuedMessages(this.messageMap.get(messageId)));
            this.messageMap.remove(messageId);
        }

    }

    @Override
    public boolean acceptOutboundMessage(Object msg) throws Exception {
        return (msg instanceof CallResponse || msg instanceof CallResponseContinue);
    }

    @Override
    public boolean acceptInboundMessage(Object msg) throws Exception {
        return (msg instanceof CallRequest || msg instanceof CallRequestContinue);
    }

}
