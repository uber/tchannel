package com.uber.tchannel.messages;

import com.uber.tchannel.tracing.Trace;

public class Cancel extends AbstractMessage {

    public final long ttl;
    public final Trace tracing;
    public final String why;

    public Cancel(long id, long ttl, Trace tracing, String why) {
        super(id, MessageType.Cancel);
        this.ttl = ttl;
        this.tracing = tracing;
        this.why = why;
    }
}
