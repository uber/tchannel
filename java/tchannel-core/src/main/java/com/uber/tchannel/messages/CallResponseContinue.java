package com.uber.tchannel.messages;

public class CallResponseContinue extends AbstractMessage {
    public CallResponseContinue(long id) {
        super(id, MessageType.CallResponseContinue);
    }
}
