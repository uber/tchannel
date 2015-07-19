package com.uber.tchannel.messages;

public class PingRequest extends AbstractPingMessage {
    public PingRequest(long id) {
        super(id, MessageType.PingRequest);
    }
}
