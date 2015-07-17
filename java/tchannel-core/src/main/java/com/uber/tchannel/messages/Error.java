package com.uber.tchannel.messages;


public class Error extends Message {
    public Error(long id) {
        super(id, MessageType.Error);
    }
}
