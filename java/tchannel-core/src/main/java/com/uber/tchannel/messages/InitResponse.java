package com.uber.tchannel.messages;

public class InitResponse extends AbstractInitMessage {

    private final MessageType messageType = MessageType.InitResponse;

    public InitResponse(long id, int version, String hostPort, String processName) {
        super(id, version, hostPort, processName);
    }

    @Override
    public MessageType getMessageType() {
        return this.messageType;
    }

}
