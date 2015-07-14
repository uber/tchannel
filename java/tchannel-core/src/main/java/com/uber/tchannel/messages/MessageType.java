package com.uber.tchannel.messages;

import java.util.Optional;

public enum MessageType {

    InitRequest((byte) 0x01);

    private final byte type;

    MessageType(byte type) {
        this.type = type;
    }

    public Optional<MessageType> forValue(byte value) {
        switch (value) {
            case 0x01:
                return Optional.of(InitRequest);
            default:
                return Optional.empty();
        }
    }

}
