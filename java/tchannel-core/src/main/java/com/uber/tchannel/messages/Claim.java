package com.uber.tchannel.messages;

import com.uber.tchannel.tracing.Trace;

public class Claim extends AbstractMessage {

    public final long ttl;
    public final Trace tracing;

    public Claim(long id, long ttl, Trace tracing) {
        super(id, MessageType.Claim);
        this.ttl = ttl;
        this.tracing = tracing;
    }
}
