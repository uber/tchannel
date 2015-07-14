package com.uber.tchannel.framing;

import com.uber.tchannel.messages.MessageType;

public class TFrame {

    public static final int MAX_FRAME_LENGTH = 65536;
    public static final int FRAME_HEADER_LENGTH = 16;

    public final int size;
    public final byte type;
    public final long id;
    public final byte[] payload;

    public TFrame(byte type, long id, byte[] payload) {
        this.type = type;
        this.id = id;
        this.payload = payload;
        this.size = FRAME_HEADER_LENGTH + payload.length;
    }

    public TFrame(MessageType messageType, long id, byte[] payload) {
        this(messageType.type, id, payload);
    }

    @Override
    public String toString() {
        return String.format(
                "<TFrame size=%d type=0x%d id=%d payload=%s>",
                this.size,
                this.type,
                this.id,
                new String(this.payload)
        );
    }
}
