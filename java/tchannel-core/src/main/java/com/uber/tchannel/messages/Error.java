package com.uber.tchannel.messages;

import com.uber.tchannel.tracing.Trace;

public class Error extends AbstractMessage {

    public final byte code;
    public final Trace tracing;
    public final String message;

    public Error(long id, byte code, Trace tracing, String message) {
        super(id, MessageType.Error);
        this.code = code;
        this.tracing = tracing;
        this.message = message;
    }

    public enum ErrorType {
        Invalid((byte) 0x00),
        Timeout((byte) 0x01),
        Cancelled((byte) 0x02),
        Busy((byte) 0x03),
        Declined((byte) 0x04),
        UnexpectedError((byte) 0x05),
        BadRequest((byte) 0x06),
        NetworkError((byte) 0x07),
        Unhealthy((byte) 0x08),
        FatalProtocolError((byte) 0xff);

        private final byte code;

        ErrorType(byte code) {
            this.code = code;
        }

        public byte byteValue() {
            return this.code;
        }
    }
}