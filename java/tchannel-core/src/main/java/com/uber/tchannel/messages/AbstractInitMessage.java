package com.uber.tchannel.messages;

public abstract class AbstractInitMessage extends AbstractMessage {
    public static final int DEFAULT_VERSION = 2;
    public static final String HOST_PORT_KEY = "host_port";
    public static final String PROCESS_NAME_KEY = "process_name";

    public final int version;
    public final String hostPort;
    public final String processName;

    public AbstractInitMessage(long id, int version, String hostPort, String processName) {
        super(id);
        this.version = version;
        this.hostPort = hostPort;
        this.processName = processName;
    }

    public abstract MessageType getMessageType();

    @Override
    public String toString() {
        return String.format(
                "<%s id=%d version=%d hostPort=%s processName=%s>",
                this.getClass().getCanonicalName(),
                this.id,
                this.version,
                this.hostPort,
                this.processName
        );
    }
}
