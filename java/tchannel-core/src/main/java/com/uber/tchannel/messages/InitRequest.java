package com.uber.tchannel.messages;

public class InitRequest extends AbstractInitMessage {

    private final MessageType messageType = MessageType.InitRequest;

    public InitRequest(long id, int version, String hostPort, String processName) {
        super(id, MessageType.InitRequest, version, hostPort, processName);
    }

    @Override
    public MessageType getMessageType() {
        return this.messageType;
    }
}
