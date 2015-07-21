package com.uber.tchannel.messages;

public class CallResponseContinue extends AbstractCallMessage {
    public CallResponseContinue(long id, MessageType messageType, byte flags, byte checksumType, int checksum,
                                byte[] arg1,byte[] arg2, byte[] arg3) {
        super(id, messageType, flags, checksumType, checksum, arg1, arg2, arg3);
    }
}
