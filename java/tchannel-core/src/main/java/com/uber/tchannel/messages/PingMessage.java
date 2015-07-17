package com.uber.tchannel.messages;

public class PingMessage extends Message {
    public PingMessage(long id, MessageType messageType) {
        super(id, messageType);
    }
}
