package com.uber.tchannel.messages;

public abstract class AbstractMessage {
    private final long id;
    private final MessageType messageType;

    public AbstractMessage(long id, MessageType messageType) {
        this.id = id;
        this.messageType = messageType;
    }

    public long getId() {
        return this.id;
    }
    
    public MessageType getMessageType() {
        return this.messageType;
    }

}
