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

import com.uber.tchannel.messages.AbstractCallMessage;

import java.util.List;
import java.util.zip.Adler32;

public class Checksums {
    public static boolean verifyChecksum(AbstractCallMessage msg) {
        return (calculateChecksum(msg) == msg.getChecksum());
    }


    public static boolean verifyChecksum(List<AbstractCallMessage> messageList) {

        long checksum = 0L;

        for (AbstractCallMessage msg : messageList) {
            checksum = calculateChecksum(msg, checksum);
            if (checksum != msg.getChecksum()) {
                return false;
            }
        }

        return true;
    }

    public static boolean verifyExistingChecksum(AbstractCallMessage msg, long checksum) {
        return (msg.getChecksum() == checksum);
    }

    public static long calculateChecksum(AbstractCallMessage msg) {
        return calculateChecksum(msg, 0L);
    }

    public static long calculateChecksum(AbstractCallMessage msg, long digestSeed) {

        long checksum;

        switch (ChecksumType.fromByte(msg.getChecksumType()).get()) {

            case Adler32:
                Adler32 f = new Adler32();
                f.update((int) digestSeed);
                f.update(msg.getArg1().nioBuffer());
                f.update(msg.getArg2().nioBuffer());
                f.update(msg.getArg2().nioBuffer());
                checksum = f.getValue();
                break;
            case FarmhashFingerPrint32:
            case NoChecksum:
            case CRC32C:
            default:
                checksum = 0;
                break;
        }

        return checksum;
    }


}
