package com.uber.tchannel.codecs;

import io.netty.buffer.ByteBuf;

import java.util.HashMap;
import java.util.Map;

public class HeaderUtils {

    public static Map<String, String> decodeHeader(int numHeaders, ByteBuf inBuf) {

        Map<String, String> headers = new HashMap<String, String>(numHeaders);

        for (int i = 0; i < numHeaders; i++) {
            String key = HeaderUtils.readValue(inBuf);
            String value = HeaderUtils.readValue(inBuf);
            headers.put(key, value);
        }

        return headers;

    }

    public static void encodeHeader(Map<String, String> headers, ByteBuf outBuf) {

        for (Map.Entry<String, String> header : headers.entrySet()) {
            HeaderUtils.writeValue(header.getKey(), outBuf);
            HeaderUtils.writeValue(header.getValue(), outBuf);
        }

    }

    private static String readValue(ByteBuf inBuf) {
        int valueLength = inBuf.readUnsignedShort();
        byte[] valueBytes = new byte[valueLength];
        inBuf.readBytes(valueBytes);
        return new String(valueBytes);
    }

    private static void writeValue(String value, ByteBuf outBuf) {
        outBuf.writeShort(value.length());
        outBuf.writeBytes(value.getBytes());
    }


}
