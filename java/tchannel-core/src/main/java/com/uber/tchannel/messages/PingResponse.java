package com.uber.tchannel.messages;

public class PingResponse extends PingMessage {
    public PingResponse(long id) {
        super(id, MessageType.PingResponse);
    }
}
