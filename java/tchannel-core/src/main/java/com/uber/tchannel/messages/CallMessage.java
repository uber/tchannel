package com.uber.tchannel.messages;

import java.util.Map;

public class CallMessage extends Message {

    public static final int MAX_ARG1_LENGTH = 16384;

    private final byte flags;
    private final byte[] tracing;
    private final Map<String, String> headers;
    private final byte checksumType;
    private final byte[] arg1;
    private final byte[] arg2;
    private final byte[] arg3;


    public CallMessage(long id, MessageType messageType, byte flags, byte[] tracing, Map<String, String> headers, byte checksumType,
                       byte[] arg1, byte[] arg2, byte[] arg3) {
        super(id, messageType);
        this.flags = flags;
        this.tracing = tracing;
        this.headers = headers;
        this.checksumType = checksumType;
        this.arg1 = arg1;
        this.arg2 = arg2;
        this.arg3 = arg3;
    }
}
