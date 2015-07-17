package com.uber.tchannel.messages;

import java.util.Map;

public class CallResponse extends CallMessage {

    private final byte code;

    public CallResponse(long id, byte flags, byte code, byte[] tracing, Map<String, String> headers,
                        byte checksumType, byte[] arg1, byte[] arg2, byte[] arg3) {
        super(id, MessageType.CallRequest, flags, tracing, headers, checksumType, arg1, arg2, arg3);
        this.code = code;
    }

}
