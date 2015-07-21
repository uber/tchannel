package com.uber.tchannel.test;


import com.uber.tchannel.messages.AbstractCallMessage;
import com.uber.tchannel.messages.CallRequest;
import com.uber.tchannel.messages.CallRequestContinue;

public class Fixtures {

    public static CallRequest callRequestWithId(long id) {
        return new CallRequest(
                id,
                (byte) 0x00,
                0L,
                null,
                null,
                null,
                (byte) 0x00,
                0,
                new byte[]{0x01},
                new byte[]{0x02},
                new byte[]{0x03}
        );
    }

    public static CallRequest callRequestWithIdAndMoreFragments(long id) {
        return new CallRequest(
                id,
                AbstractCallMessage.MORE_FRAGMENTS_TO_FOLLOW_MASK,
                0L,
                null,
                null,
                null,
                (byte) 0x00,
                0,
                new byte[]{0x01},
                new byte[]{0x02},
                new byte[]{0x03}
        );
    }


    public static CallRequestContinue callRequestContinueWithId(long id) {
        return new CallRequestContinue(
                id,
                (byte) 0x00,
                (byte) 0x00,
                0,
                new byte[]{0x01},
                new byte[]{0x02},
                new byte[]{0x03}
        );
    }

    public static CallRequestContinue callRequestContinueWithIdAndMoreFragments(long id) {
        return new CallRequestContinue(
                id,
                AbstractCallMessage.MORE_FRAGMENTS_TO_FOLLOW_MASK,
                (byte) 0x00,
                0,
                new byte[]{0x01},
                new byte[]{0x02},
                new byte[]{0x03}
        );
    }

}
