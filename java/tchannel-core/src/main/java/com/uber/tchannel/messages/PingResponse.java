package com.uber.tchannel.messages;

public class PingResponse extends AbstractPingMessage {
    public PingResponse(long id) {
        super(id, MessageType.PingResponse);
    }
}
