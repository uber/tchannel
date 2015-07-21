package com.uber.tchannel.messages;

import com.uber.tchannel.tracing.Trace;

import java.util.Map;

public class CallRequest extends AbstractCallMessage {

    private final long ttl;
    private final Trace tracing;
    private final String service;
    private final Map<String, String> headers;

    public CallRequest(long id, byte flags, long ttl, Trace tracing, String service,
                       Map<String, String> headers, byte checksumType, int checksum,
                       byte[] arg1, byte[] arg2, byte[] arg3) {
        super(id, MessageType.CallRequest, flags, checksumType, checksum, arg1, arg2, arg3);
        this.ttl = ttl;
        this.service = service;
        this.tracing = tracing;
        this.headers = headers;
    }
}
