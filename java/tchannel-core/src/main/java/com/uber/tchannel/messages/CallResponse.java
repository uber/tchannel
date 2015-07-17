package com.uber.tchannel.messages;

public class CallResponse extends CallMessage {
    public CallResponse(long id) {
        super(id, MessageType.CallResponse);
    }
}
