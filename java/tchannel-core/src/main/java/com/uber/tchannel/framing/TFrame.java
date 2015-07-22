package com.uber.tchannel.framing;

import com.uber.tchannel.messages.MessageType;
import io.netty.buffer.ByteBuf;

public class TFrame {


    public static final int MAX_FRAME_LENGTH = 65536;
    public static final int FRAME_HEADER_LENGTH = 16;

    public final int size;
    public final byte type;
    public final long id;
    public final ByteBuf payload;


    public TFrame(int size, byte type, long id, ByteBuf payload) {
        this.size = size;
        this.type = type;
        this.id = id;
        this.payload = payload;
    }

    public TFrame(int size, MessageType messageType, long id, ByteBuf payload) {
        this(size, messageType.byteValue(), id, payload);
    }

    @Override
    public String toString() {
        return String.format(
                "<TFrame size=%d type=0x%d id=%d payload=%s>",
                this.size,
                this.type,
                this.id,
                this.payload
        );
    }
}
