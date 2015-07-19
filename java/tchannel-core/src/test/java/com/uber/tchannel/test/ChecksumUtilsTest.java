package com.uber.tchannel.test;

import com.uber.tchannel.checksum.ChecksumUtils;
import com.uber.tchannel.messages.AbstractCallMessage;
import org.junit.Test;

import java.util.LinkedList;
import java.util.List;

import static org.junit.Assert.assertTrue;

public class ChecksumUtilsTest {
    
    @Test
    public void testVerifyAcceptNoChecksum() throws Exception {
        assertTrue(ChecksumUtils.verifyChecksum(Fixtures.callRequestWithId(0)));
    }

    @Test
    public void testVerifyNoChecksumChecksumList() throws Exception {

        List<AbstractCallMessage> msgList = new LinkedList<AbstractCallMessage>();
        msgList.add(Fixtures.callRequestWithId(0));
        msgList.add(Fixtures.callRequestWithId(0));
        assertTrue(ChecksumUtils.verifyChecksum(msgList));


    }
}