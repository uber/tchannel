package com.uber.tchannel.tracing;

public class Trace {

    private static final byte TRACING_ENABLED_MASK = (byte) 0x01;

    public final long spanId; // Unsigned
    public final long parentId; // Unsigned
    public final long traceId; // Unsigned
    public final byte traceFlags; // Unsigned

    public Trace(long spanId, long parentId, long traceId, byte traceFlags) {
        this.spanId = spanId;
        this.parentId = parentId;
        this.traceId = traceId;
        this.traceFlags = traceFlags;
    }

    public boolean isTracingEnabled() {
        return (this.traceFlags & TRACING_ENABLED_MASK) == (byte) 1;
    }
}
