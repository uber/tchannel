package com.uber.tchannel.codecs;

import io.netty.buffer.ByteBuf;

import java.util.HashMap;
import java.util.Map;

public class HeaderCodec {

    public static Map<String, String> decodeHeader(int numHeaders, ByteBuf inBuf) {

        Map<String, String> headers = new HashMap<String, String>(numHeaders);

        for (int i = 0; i < numHeaders; i++) {
            int keyLength = inBuf.readUnsignedShort();
            byte[] keyBytes = new byte[keyLength];
            inBuf.readBytes(keyBytes);
            String key = new String(keyBytes);

            int valueLength = inBuf.readUnsignedShort();
            byte[] valueBytes = new byte[valueLength];
            inBuf.readBytes(valueBytes);
            String value = new String(valueBytes);

            headers.put(key, value);
        }

        return headers;

    }

    public static void encodeHeader(Map<String, String> headers, ByteBuf outBuf) {

        for (Map.Entry<String, String> header : headers.entrySet()) {
            String key = header.getKey();
            String value = header.getValue();

            outBuf.writeShort(key.length());
            outBuf.writeBytes(key.getBytes());
            outBuf.writeShort(value.length());
            outBuf.writeBytes(value.getBytes());

        }

    }

}
