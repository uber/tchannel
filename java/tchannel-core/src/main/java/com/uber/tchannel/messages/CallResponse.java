package com.uber.tchannel.messages;

import com.uber.tchannel.tracing.Trace;

import java.util.Map;

public class CallResponse extends AbstractCallMessage {

    private final byte code;

    public CallResponse(long id, byte flags, byte code, Trace tracing, Map<String, String> headers,
                        byte checksumType, int checksum, byte[] arg1, byte[] arg2, byte[] arg3) {
        super(id, MessageType.CallRequest, flags, tracing, headers, checksumType, checksum, arg1, arg2, arg3);
        this.code = code;
    }

}
