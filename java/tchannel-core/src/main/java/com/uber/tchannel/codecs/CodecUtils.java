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

import com.uber.tchannel.tracing.Trace;
import io.netty.buffer.ByteBuf;

import java.util.HashMap;
import java.util.Map;

public class CodecUtils {


    public static String decodeString(ByteBuf inBuf) {
        int valueLength = inBuf.readUnsignedShort();
        byte[] valueBytes = new byte[valueLength];
        inBuf.readBytes(valueBytes);
        return new String(valueBytes);
    }

    public static void encodeString(String value, ByteBuf outBuf) {
        byte[] raw = value.getBytes();
        outBuf.writeShort(raw.length);
        outBuf.writeBytes(raw);
    }

    public static String decodeSmallString(ByteBuf inBuf) {
        int valueLength = inBuf.readUnsignedByte();
        byte[] valueBytes = new byte[valueLength];
        inBuf.readBytes(valueBytes);
        return new String(valueBytes);
    }

    public static void encodeSmallString(String value, ByteBuf outBuf) {
        byte[] raw = value.getBytes();
        outBuf.writeByte(raw.length);
        outBuf.writeBytes(raw);
    }

    public static Map<String, String> decodeHeaders(ByteBuf inBuf) {

        int numHeaders = inBuf.readUnsignedShort();
        Map<String, String> headers = new HashMap<String, String>(numHeaders);

        for (int i = 0; i < numHeaders; i++) {
            String key = CodecUtils.decodeString(inBuf);
            String value = CodecUtils.decodeString(inBuf);
            headers.put(key, value);

        }

        return headers;

    }

    public static void encodeHeaders(Map<String, String> headers, ByteBuf outBuf) {

        outBuf.writeShort(headers.size());

        for (Map.Entry<String, String> header : headers.entrySet()) {
            CodecUtils.encodeString(header.getKey(), outBuf);
            CodecUtils.encodeString(header.getValue(), outBuf);
        }

    }

    public static Map<String, String> decodeSmallHeaders(ByteBuf inBuf) {

        short numHeaders = inBuf.readUnsignedByte();
        Map<String, String> headers = new HashMap<String, String>(numHeaders);

        for (int i = 0; i < numHeaders; i++) {
            String key = CodecUtils.decodeSmallString(inBuf);
            String value = CodecUtils.decodeSmallString(inBuf);
            headers.put(key, value);
        }

        return headers;

    }

    public static void encodeSmallHeaders(Map<String, String> headers, ByteBuf outBuf) {

        outBuf.writeByte(headers.size());

        for (Map.Entry<String, String> header : headers.entrySet()) {
            CodecUtils.encodeSmallString(header.getKey(), outBuf);
            CodecUtils.encodeSmallString(header.getValue(), outBuf);
        }

    }

    public static Trace decodeTrace(ByteBuf inBuf) {
        long spanId = inBuf.readLong();
        long parentId = inBuf.readLong();
        long traceId = inBuf.readLong();
        byte traceFlags = inBuf.readByte();

        return new Trace(spanId, parentId, traceId, traceFlags);
    }

    public static void encodeTrace(Trace trace, ByteBuf outBuf) {
        outBuf.writeLong(trace.spanId)
                .writeLong(trace.parentId)
                .writeLong(trace.traceId)
                .writeByte(trace.traceFlags);
    }

    public static byte[] decodeArg(ByteBuf inBuf) {
        int argLength = inBuf.readUnsignedShort();
        byte[] outBytes = new byte[argLength];
        inBuf.readBytes(outBytes);
        return outBytes;
    }


    public static void encodeArg(byte[] arg, ByteBuf outBuf) {
        outBuf.writeShort((short) arg.length);
        outBuf.writeBytes(arg);
    }

}
