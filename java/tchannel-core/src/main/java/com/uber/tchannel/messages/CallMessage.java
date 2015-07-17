package com.uber.tchannel.messages;

public class CallMessage extends Message {
    public CallMessage(long id, MessageType messageType) {
        super(id, messageType);
    }
}
