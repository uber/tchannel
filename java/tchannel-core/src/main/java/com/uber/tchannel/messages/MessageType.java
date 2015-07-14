package com.uber.tchannel.messages;

import java.util.Optional;

public enum MessageType {

    InitRequest((byte) 0x01),
    InitResponse((byte) 0x02),
    Error((byte) 0xff);

    public final byte type;

    MessageType(byte type) {
        this.type = type;
    }

    public static Optional<MessageType> forValue(byte value) {
        switch (value) {
            case (byte) 0x01:
                return Optional.of(InitRequest);
            case (byte) 0x02:
                return Optional.of(InitResponse);
            case (byte) 0xff:
                return Optional.of(Error);
            default:
                return Optional.empty();
        }
    }

}
