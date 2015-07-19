package com.uber.tchannel.messages;

public abstract class AbstractPingMessage extends AbstractMessage {
    public AbstractPingMessage(long id, MessageType messageType) {
        super(id, messageType);
    }
}
