package com.uber.tchannel.messages;

public class InitRequest extends InitMessage {

    public InitRequest(long id, int version, String hostPort, String processName) {
        super(id, MessageType.InitRequest, version, hostPort, processName);
    }

}
