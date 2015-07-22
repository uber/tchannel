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

import com.uber.tchannel.Fixtures;
import com.uber.tchannel.messages.AbstractCallMessage;
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