package com.uber.tchannel.messages;

public class InitResponse extends AbstractInitMessage {

    public InitResponse(long id, int version, String hostPort, String processName) {
        super(id, MessageType.InitResponse, version, hostPort, processName);
    }

}
