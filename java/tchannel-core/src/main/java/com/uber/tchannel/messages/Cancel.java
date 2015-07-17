package com.uber.tchannel.messages;

public class Cancel extends Message {

    private final long ttl;
    private final byte[] tracing;
    private final String why;

    public Cancel(long id, long ttl, byte[] tracing, String why) {
        super(id, MessageType.Cancel);
        this.ttl = ttl;
        this.tracing = tracing;
        this.why = why;
    }
}
