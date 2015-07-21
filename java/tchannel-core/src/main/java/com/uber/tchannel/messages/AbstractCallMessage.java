package com.uber.tchannel.messages;

public abstract class AbstractCallMessage extends AbstractMessage {

    public static final int MAX_ARG1_LENGTH = 16384;
    public static final byte MORE_FRAGMENTS_TO_FOLLOW_MASK = (byte) 0x01;

    public final byte flags;
    public final byte checksumType;
    public final int checksum; // TODO: `checksums` are optional, can be removed for possible perf. wins.. //
    public byte[] arg1;
    public byte[] arg2;
    public byte[] arg3;

    public AbstractCallMessage(long id, MessageType messageType, byte flags, byte checksumType, int checksum,
                               byte[] arg1, byte[] arg2, byte[] arg3) {
        super(id, messageType);
        this.flags = flags;
        this.checksumType = checksumType;
        this.checksum = checksum;
        this.arg1 = arg1;
        this.arg2 = arg2;
        this.arg3 = arg3;
    }

    public boolean moreFragmentsRemain() {
        return ((this.flags & MORE_FRAGMENTS_TO_FOLLOW_MASK) == 1);
    }


}
