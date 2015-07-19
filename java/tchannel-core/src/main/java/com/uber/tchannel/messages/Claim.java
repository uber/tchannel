package com.uber.tchannel.messages;

public class Claim extends AbstractMessage {

    private final long ttl;
    private final byte[] tracing;

    public Claim(long id, long ttl, byte[] tracing) {
        super(id, MessageType.Claim);
        this.ttl = ttl;
        this.tracing = tracing;
    }
}
