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
package com.uber.tchannel.messages;

public abstract class AbstractInitMessage extends AbstractMessage {
    public static final int DEFAULT_VERSION = 2;
    public static final String HOST_PORT_KEY = "host_port";
    public static final String PROCESS_NAME_KEY = "process_name";

    private final int version;
    private final String hostPort;
    private final String processName;

    public AbstractInitMessage(long id, MessageType messageType, int version, String hostPort, String processName) {
        super(id, messageType);
        this.version = version;
        this.hostPort = hostPort;
        this.processName = processName;
    }

    @Override
    public String toString() {
        return String.format(
                "<%s id=%d version=%d hostPort=%s processName=%s>",
                this.getClass().getCanonicalName(),
                this.getId(),
                this.version,
                this.hostPort,
                this.processName
        );
    }

    public int getVersion() {
        return version;
    }

    public String getHostPort() {
        return hostPort;
    }

    public String getProcessName() {
        return processName;
    }
}
