package com.uber.tchannel;

public class Frame {

    public final int size;
    public final byte type;
    public final long id;
    public final byte[] payload;

    public Frame(int size, byte type, long id, byte[] payload){
        this.size = size;
        this.type = type;
        this.id = id;
        this.payload = payload;
    }

}
