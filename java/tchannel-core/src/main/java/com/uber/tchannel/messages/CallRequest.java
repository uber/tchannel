package com.uber.tchannel.messages;

public class CallRequest extends CallMessage {
    public CallRequest(long id) {
        super(id, MessageType.CallRequest);
    }
}
