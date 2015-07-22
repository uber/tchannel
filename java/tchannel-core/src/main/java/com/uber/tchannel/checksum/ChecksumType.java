/*
 * Copyright (c) 2015 Uber Technologies, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
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
