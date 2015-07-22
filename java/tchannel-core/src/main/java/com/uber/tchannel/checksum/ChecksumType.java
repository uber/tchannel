package com.uber.tchannel.checksum;

import java.util.Optional;

public enum ChecksumType {
    NoChecksum((byte) 0x00),
    Adler32((byte) 0x1),
    FarmhashFingerPrint32((byte) 0x02),
    CRC32C((byte) 0x03);

    private final byte type;

    ChecksumType(byte type) {
        this.type = type;
    }

    public static Optional<ChecksumType> fromByte(byte value) {
        switch (value) {
            case (byte) 0x00:
                return Optional.of(NoChecksum);
            case (byte) 0x01:
                return Optional.of(Adler32);
            case (byte) 0x02:
                return Optional.of(FarmhashFingerPrint32);
            case (byte) 0x03:
                return Optional.of(CRC32C);
            default:
                return Optional.empty();
        }
    }

    public byte byteValue() {
        return this.type;
    }


}
