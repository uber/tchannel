package com.uber.tchannel.messages;

public class CallResponseContinue extends Message {
    public CallResponseContinue(long id) {
        super(id, MessageType.CallResponseContinue);
    }
}
