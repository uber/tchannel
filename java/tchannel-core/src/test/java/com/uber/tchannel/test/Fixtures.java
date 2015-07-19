package com.uber.tchannel.test;


import com.uber.tchannel.messages.CallRequest;
import com.uber.tchannel.tracing.Trace;

import java.util.HashMap;

public class Fixtures {

    public static CallRequest callRequestWithId(long id) {
        return new CallRequest(
                id,
                (byte) 0x00,
                0L,
                new Trace(0, 0, 0, (byte) 0x01),
                "service",
                new HashMap<String, String>(),
                (byte) 0x00,
                0,
                new byte[]{},
                new byte[]{},
                new byte[]{}
        );
    }

}
