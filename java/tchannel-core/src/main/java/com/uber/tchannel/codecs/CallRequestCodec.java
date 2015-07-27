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

import com.uber.tchannel.checksum.ChecksumType;
import com.uber.tchannel.fragmentation.DefragmentationState;
import com.uber.tchannel.framing.TFrame;
import com.uber.tchannel.messages.AbstractCallMessage;
import com.uber.tchannel.messages.CallRequest;
import com.uber.tchannel.messages.CallRequestContinue;
import com.uber.tchannel.messages.MessageType;
import com.uber.tchannel.tracing.Trace;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.MessageToMessageCodec;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class CallRequestCodec extends MessageToMessageCodec<TFrame, AbstractCallMessage> {

    private final Map<Long, DefragmentationState> defragmentationState = new HashMap<Long, DefragmentationState>();

    @Override
    protected void encode(ChannelHandlerContext ctx, AbstractCallMessage msg, List<Object> out) throws Exception {

    }

    @Override
    protected void decode(ChannelHandlerContext ctx, TFrame frame, List<Object> out) {
        MessageType type = MessageType.fromByte(frame.type).get();
        switch (type) {
            case CallRequest:
                this.decodeCallRequest(ctx, frame, out);
                break;
            case CallRequestContinue:
                this.decodeCallRequestContinue(ctx, frame, out);
                break;
        }
    }

    @Override
    public boolean acceptInboundMessage(Object msg) throws Exception {
        TFrame frame = (TFrame) msg;
        MessageType type = MessageType.fromByte(frame.type).get();
        switch (type) {
            case CallRequest:
            case CallRequestContinue:
                return true;
            default:
                return false;
        }
    }

    private void decodeCallRequest(ChannelHandlerContext ctx, TFrame frame, List<Object> out) {
        ByteBuf buffer = frame.payload.readSlice(frame.size);
        buffer.retain();

        // flags:1
        byte flags = buffer.readByte();

        // ttl:4
        long ttl = buffer.readUnsignedInt();

        // tracing:25
        Trace trace = CodecUtils.decodeTrace(buffer);

        // service~1
        String service = CodecUtils.decodeSmallString(buffer);

        // nh:1 (hk~1, hv~1){nh}
        Map<String, String> headers = CodecUtils.decodeSmallHeaders(buffer);

        // csumtype:1
        byte checksumType = buffer.readByte();
        ChecksumType type = ChecksumType.fromByte(checksumType).get();

        // (csum:4){0,1}
        int checksum = 0;
        switch (type) {
            case NoChecksum:
                break;
            case Adler32:
            case FarmhashFingerPrint32:
            case CRC32C:
                checksum = buffer.readInt();
                break;
        }

        // arg1~2 arg2~2 arg3~2
        ByteBuf arg1 = this.processBuffer(buffer, frame);
        ByteBuf arg2 = this.processBuffer(buffer, frame);
        ByteBuf arg3 = this.processBuffer(buffer, frame);

        CallRequest req = new CallRequest(frame.id, flags, ttl, trace, service, headers, checksumType, checksum,
                arg1,
                arg2,
                arg3
        );

        out.add(req);
        buffer.release();
    }

    private void decodeCallRequestContinue(ChannelHandlerContext ctx, TFrame frame, List<Object> out) {
        ByteBuf buffer = frame.payload.readSlice(frame.size);
        buffer.retain();

        // flags:1
        byte flags = buffer.readByte();

        // csumtype:1
        byte checksumType = buffer.readByte();
        ChecksumType type = ChecksumType.fromByte(checksumType).get();

        // (csum:4){0,1}
        int checksum = 0;
        switch (type) {
            case NoChecksum:
                break;
            case Adler32:
            case FarmhashFingerPrint32:
            case CRC32C:
                checksum = buffer.readInt();
                break;
        }

        // {continuation}
        ByteBuf arg1 = this.processBuffer(buffer, frame);
        ByteBuf arg2 = this.processBuffer(buffer, frame);
        ByteBuf arg3 = this.processBuffer(buffer, frame);

        CallRequestContinue req = new CallRequestContinue(frame.id, flags, checksumType, checksum,
                arg1,
                arg2,
                arg3
        );

        out.add(req);
        buffer.release();

    }


    private int bytesRemaining(ByteBuf buffer, TFrame frame) {
        return frame.size - buffer.readerIndex();
    }


    private ByteBuf processBuffer(ByteBuf buffer, TFrame frame) {

        /* Get Defragmentation State for this MessageID, or initialize it to PROCESSING_ARG_1 */
        DefragmentationState currentState = this.defragmentationState.getOrDefault(
                frame.id,
                DefragmentationState.PROCESSING_ARG_1
        );

        /* Return early if there are no bytes remaining in the frame */
        if (this.bytesRemaining(buffer, frame) <= 0) {
            return Unpooled.EMPTY_BUFFER;
        }

        int argLength;
        switch (currentState) {

            case PROCESSING_ARG_1:

                /* arg1~2. CANNOT be fragmented. MUST be < 16k */
                argLength = buffer.readUnsignedShort();
                assert argLength <= AbstractCallMessage.MAX_ARG1_LENGTH;

                /* Read a slice, retain a copy */
                ByteBuf arg1 = buffer.readSlice(argLength);
                arg1.retain();

                /* Move to the next state... */
                this.defragmentationState.put(frame.id, DefragmentationState.nextState(currentState));
                return arg1;

            case PROCESSING_ARG_2:

                /* arg2~2. MAY be fragmented. No size limit */
                argLength = buffer.readUnsignedShort();

                if (argLength == 0) {
                    /* arg2 is done when it's 0 bytes */
                    this.defragmentationState.put(frame.id, DefragmentationState.nextState(currentState));
                    return Unpooled.EMPTY_BUFFER;
                }

                /* Read a slice, retain a copy */
                ByteBuf arg2 = buffer.readSlice(argLength);
                arg2.retain();

                return arg2;

            case PROCESSING_ARG_3:

                /* arg3~2. MAY be fragmented. No size limit */
                argLength = buffer.readUnsignedShort();

                if (argLength == 0) {
                    /* arg3 is done when 'No Frames Remaining' flag is set, or 0 bytes remain */
                    this.defragmentationState.remove(frame.id);
                    return Unpooled.EMPTY_BUFFER;
                }

                /* Read a slice, retain a copy */
                ByteBuf arg3 = buffer.readSlice(argLength);
                arg3.retain();

                /* If 'No Frames Remaining', we're done with this MessageId */
                this.defragmentationState.remove(frame.id);
                return arg3;

            default:
                throw new RuntimeException(String.format("Unexpected 'DefragmentationState': %s", currentState));
        }


    }

}
