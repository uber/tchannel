package com.uber.tchannel.messages;

public abstract class AbstractMessage {
    private final long id;

    public AbstractMessage(long id) {
        this.id = id;
    }
}
