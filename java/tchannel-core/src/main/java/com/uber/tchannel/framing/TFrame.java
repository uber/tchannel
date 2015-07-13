package com.uber.tchannel.framing;

public class TFrame {

    public static final int MAX_FRAME_LENGTH = 65536;
    public static final int FRAME_HEADER_LENGTH = 16;

    public final int size;
    public final byte type;
    public final long id;
    public final byte[] payload;

    public TFrame(int size, byte type, long id, byte[] payload){
        this.size = size;
        this.type = type;
        this.id = id;
        this.payload = payload;
    }

    public TFrame(byte type, long id, byte[] payload){
        this.type = type;
        this.id = id;
        this.payload = payload;
        this.size = FRAME_HEADER_LENGTH + payload.length;
    }

}
