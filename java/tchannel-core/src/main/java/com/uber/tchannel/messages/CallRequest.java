package com.uber.tchannel.messages;

import java.util.Map;

public class CallRequest extends CallMessage {

    private final long ttl;
    private final String service;

    public CallRequest(long id, byte flags, long ttl, byte[] tracing, String service, Map<String, String> headers,
                       byte checksumType, byte[] arg1, byte[] arg2, byte[] arg3) {
        super(id, MessageType.CallRequest, flags, tracing, headers, checksumType, arg1, arg2, arg3);
        this.ttl = ttl;
        this.service = service;
    }
}
