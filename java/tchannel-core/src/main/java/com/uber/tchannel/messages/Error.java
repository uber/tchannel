package com.uber.tchannel.messages;


public class Error extends Message {

    private final byte code;
    private final byte[] tracing;
    private final String message;

    public Error(long id, byte code, byte[] tracing, String message) {
        super(id, MessageType.Error);
        this.code = code;
        this.tracing = tracing;
        this.message = message;
    }
}
