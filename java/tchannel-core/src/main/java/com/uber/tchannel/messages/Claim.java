package com.uber.tchannel.messages;

public class Claim extends Message {
    public Claim(long id) {
        super(id, MessageType.Claim);
    }
}
