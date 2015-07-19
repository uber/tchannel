package com.uber.tchannel.messages;

import com.uber.tchannel.tracing.Trace;

import java.util.Map;

public abstract class AbstractCallMessage extends AbstractMessage {

    public static final int MAX_ARG1_LENGTH = 16384;

    private final byte flags;
    private final Trace tracing;
    private final Map<String, String> headers;
    private final byte checksumType;
    private final int checksum; // TODO: `checksums` are optional, can be removed for possible perf. wins.. //
    private final byte[] arg1;
    private final byte[] arg2;
    private final byte[] arg3;

    public AbstractCallMessage(long id, MessageType messageType, byte flags, Trace tracing, Map<String, String> headers, byte checksumType,
                               int checksum, byte[] arg1, byte[] arg2, byte[] arg3) {
        super(id, messageType);
        this.flags = flags;
        this.tracing = tracing;
        this.headers = headers;
        this.checksumType = checksumType;
        this.checksum = checksum;
        this.arg1 = arg1;
        this.arg2 = arg2;
        this.arg3 = arg3;
    }


    public byte getChecksumType() {
        return checksumType;
    }

    public int getChecksum() {
        return checksum;
    }

    public byte[] getArg1() {
        return arg1;
    }

    public byte[] getArg2() {
        return arg2;
    }

    public byte[] getArg3() {
        return arg3;
    }

}
