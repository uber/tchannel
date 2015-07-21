package com.uber.tchannel.messages;

public class CallRequestContinue extends AbstractCallMessage {
    public CallRequestContinue(long id, byte flags, byte checksumType, int checksum, byte[] arg1, byte[] arg2, byte[] arg3) {
        super(id, MessageType.CallRequestContinue, flags, checksumType, checksum, arg1, arg2, arg3);
    }
}
