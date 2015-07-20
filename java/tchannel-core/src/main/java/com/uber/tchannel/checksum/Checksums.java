package com.uber.tchannel.checksum;

import com.uber.tchannel.messages.AbstractCallMessage;
import com.uber.tchannel.messages.ChecksumType;

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

    private static long calculateChecksum(AbstractCallMessage msg) {
        return calculateChecksum(msg, 0L);
    }

    private static long calculateChecksum(AbstractCallMessage msg, long digestSeed) {

        long checksum;

        switch (ChecksumType.fromByte(msg.getChecksumType()).get()) {

            case Adler32:
                Adler32 f = new Adler32();
                f.update((int) digestSeed);
                f.update(msg.getArg1());
                f.update(msg.getArg2());
                f.update(msg.getArg3());
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
