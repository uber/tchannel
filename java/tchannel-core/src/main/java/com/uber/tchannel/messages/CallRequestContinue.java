package com.uber.tchannel.messages;

public class CallRequestContinue extends AbstractMessage {
    public CallRequestContinue(long id) {
        super(id, MessageType.CallRequestContinue);
    }
}
