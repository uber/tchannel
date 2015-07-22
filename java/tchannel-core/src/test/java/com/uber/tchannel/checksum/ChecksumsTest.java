package com.uber.tchannel.checksum;

import com.uber.tchannel.messages.AbstractCallMessage;
import com.uber.tchannel.Fixtures;
import org.junit.Test;

import java.util.LinkedList;
import java.util.List;

import static org.junit.Assert.assertTrue;

public class ChecksumsTest {

    @Test
    public void testVerifyAcceptNoChecksum() throws Exception {
        assertTrue(Checksums.verifyChecksum(Fixtures.callRequestWithId(0)));
    }

    @Test
    public void testVerifyNoChecksumChecksumList() throws Exception {

        List<AbstractCallMessage> msgList = new LinkedList<AbstractCallMessage>();
        msgList.add(Fixtures.callRequestWithId(0));
        msgList.add(Fixtures.callRequestWithId(0));
        assertTrue(Checksums.verifyChecksum(msgList));


    }
}