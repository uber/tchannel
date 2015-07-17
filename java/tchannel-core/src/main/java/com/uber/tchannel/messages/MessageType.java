package com.uber.tchannel.messages;

import java.util.Optional;


public enum MessageType {

    InitRequest((byte) 0x01),
    InitResponse((byte) 0x02),
    CallRequest((byte) 0x03),
    CallResponse((byte) 0x04),
    CallRequestContinue((byte) 0x13),
    CallResponseContinue((byte) 0x14),
    Cancel((byte) 0xc0),
    Claim((byte) 0xc1),
    PingRequest((byte) 0xd0),
    PingResponse((byte) 0xd1),
    Error((byte) 0xff),
    None((byte) 0xfe);

    private final byte type;

    MessageType(byte type) {
        this.type = type;
    }

    public static Optional<com.uber.tchannel.messages.MessageType> fromByte(byte value) {
        switch (value) {
            case (byte) 0x01:
                return Optional.of(InitRequest);
            case (byte) 0x02:
                return Optional.of(InitResponse);
            case (byte) 0x03:
                return Optional.of(CallRequest);
            case (byte) 0x04:
                return Optional.of(CallResponse);
            case (byte) 0x13:
                return Optional.of(CallRequestContinue);
            case (byte) 0x14:
                return Optional.of(CallResponseContinue);
            case (byte) 0xc0:
                return Optional.of(Cancel);
            case (byte) 0xc1:
                return Optional.of(Claim);
            case (byte) 0xd0:
                return Optional.of(PingRequest);
            case (byte) 0xd1:
                return Optional.of(PingRequest);
            case (byte) 0xff:
                return Optional.of(Error);
            default:
                return Optional.empty();
        }
    }

    public byte byteValue() {
        return this.type;
    }

}
