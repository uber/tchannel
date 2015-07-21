package com.uber.tchannel.test.codecs;

import com.uber.tchannel.codecs.CodecUtils;
import com.uber.tchannel.tracing.Trace;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;

public class CodecUtilsTest {

    @Test
    public void testEncodeDecodeString() throws Exception {
        String str = "Hello, TChannel!";
        ByteBuf buf = Unpooled.buffer();
        CodecUtils.encodeString(str, buf);
        String newStr = CodecUtils.decodeString(buf);
        assertEquals(str, newStr);
    }

    @Test
    public void testEncodeDecodeUnicodeString() throws Exception {
        String str = "チャンネル";
        ByteBuf buf = Unpooled.buffer();
        CodecUtils.encodeString(str, buf);
        String newStr = CodecUtils.decodeString(buf);
        assertEquals(str, newStr);
    }

    @Test
    public void testEncodeDecodeEmojiString() throws Exception {
        String str = "\uD83C\uDF89\uD83C\uDF7B";
        ByteBuf buf = Unpooled.buffer();
        CodecUtils.encodeString(str, buf);
        String newStr = CodecUtils.decodeString(buf);
        assertEquals(str, newStr);
    }

    @Test
    public void testEncodeDecodeSmallString() throws Exception {
        String str = "Hello, TChannel!";
        ByteBuf buf = Unpooled.buffer();
        CodecUtils.encodeSmallString(str, buf);
        String newStr = CodecUtils.decodeSmallString(buf);
        assertEquals(str, newStr);
    }

    @Test
    public void testEncodeDecodeUnicodeSmallString() throws Exception {
        String str = "チャンネル";
        ByteBuf buf = Unpooled.buffer();
        CodecUtils.encodeSmallString(str, buf);
        String newStr = CodecUtils.decodeSmallString(buf);
        assertEquals(str, newStr);
    }


    @Test
    public void testEncodeDecodeHeaders() throws Exception {
        Map<String, String> headers = new HashMap<String, String>();
        ByteBuf buf = Unpooled.buffer();

        headers.put("Hello", "TChannel");
        headers.put("您好", "通道");
        headers.put("こんにちは", "世界");

        CodecUtils.encodeHeaders(headers, buf);

        Map<String, String> newHeaders = CodecUtils.decodeHeaders(buf);
        assertEquals(headers, newHeaders);

    }

    @Test
    public void testEncodeDecodeSmallHeaders() throws Exception {
        Map<String, String> headers = new HashMap<String, String>();
        ByteBuf buf = Unpooled.buffer();

        headers.put("Hello", "TChannel");
        headers.put("您好", "通道");
        headers.put("こんにちは", "世界");

        CodecUtils.encodeSmallHeaders(headers, buf);

        Map<String, String> newHeaders = CodecUtils.decodeSmallHeaders(buf);
        assertEquals(headers, newHeaders);
    }


    @Test
    public void testEncodeDecodeTrace() throws Exception {

        Trace trace = new Trace(1, 2, 3, (byte) 0x04);
        ByteBuf buf = Unpooled.buffer();
        CodecUtils.encodeTrace(trace, buf);
        Trace newTrace = CodecUtils.decodeTrace(buf);
        assertEquals(trace.parentId, newTrace.parentId);
        assertEquals(trace.spanId, newTrace.spanId);
        assertEquals(trace.traceId, newTrace.traceId);
        assertEquals(trace.traceFlags, newTrace.traceFlags);

    }

    @Test
    public void testEncodeDecodeArg() throws Exception {



    }

}