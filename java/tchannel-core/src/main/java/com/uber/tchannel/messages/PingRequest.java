package com.uber.tchannel.messages;

public class PingRequest extends PingMessage {
    public PingRequest(long id) {
        super(id, MessageType.PingRequest);
    }
}
