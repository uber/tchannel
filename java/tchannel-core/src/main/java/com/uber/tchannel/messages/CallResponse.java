package com.uber.tchannel.messages;

public class CallResponse extends AbstractCallMessage {

    private static final byte RESPONSE_CODE_OK_MASK = (byte) 0x00;
    private static final byte RESPONSE_CODE_ERROR_MASK = (byte) 0x01;

    private final byte code;

    public CallResponse(long id, byte flags, byte code, byte checksumType, int checksum,
                        byte[] arg1, byte[] arg2, byte[] arg3) {
        super(id, MessageType.CallRequest, flags, checksumType, checksum, arg1, arg2, arg3);
        this.code = code;
    }

}
