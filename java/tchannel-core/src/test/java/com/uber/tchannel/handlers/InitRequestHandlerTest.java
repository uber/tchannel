package com.uber.tchannel.handlers;

import com.uber.tchannel.Fixtures;
import com.uber.tchannel.messages.*;
import com.uber.tchannel.messages.Error;
import io.netty.channel.embedded.EmbeddedChannel;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.ExpectedException;

import java.nio.channels.ClosedChannelException;

import static org.hamcrest.CoreMatchers.is;
import static org.junit.Assert.*;

public class InitRequestHandlerTest {

    @Rule
    public final ExpectedException expectedClosedChannelException = ExpectedException.none();

    @Test
    public void testInitHandlerRemovesItself() throws Exception {

        // Given
        EmbeddedChannel channel = new EmbeddedChannel(
                new InitRequestHandler()
        );

        assertEquals(channel.pipeline().names().size(), 3);

        InitRequest initRequest = new InitRequest(42, AbstractInitMessage.DEFAULT_VERSION, "0.0.0.0:0", "test-process");
        channel.writeInbound(initRequest);
        channel.writeOutbound(channel.readInbound());

        // Then
        InitResponse initResponse = channel.readOutbound();

        // Assert
        assertNotNull(initResponse);
        assertEquals(initRequest.getId(), initResponse.getId());
        assertEquals(initRequest.version, initResponse.version);
        assertEquals(initRequest.hostPort, initResponse.hostPort);

        // Assert Pipeline is empty
        assertEquals(channel.pipeline().names().size(), 2);

        // Make sure Messages are still passed through
        channel.writeInbound(initRequest);
        channel.writeOutbound(channel.readInbound());
        InitRequest sameInitRequest = channel.readOutbound();
        assertEquals(initRequest.getId(), sameInitRequest.getId());
        assertEquals(initRequest.version, sameInitRequest.version);
        assertEquals(initRequest.hostPort, sameInitRequest.hostPort);

    }

    @Test
    public void testValidInitRequest() throws Exception {

        // Given
        EmbeddedChannel channel = new EmbeddedChannel(
                new InitRequestHandler()
        );


        InitRequest initRequest = new InitRequest(42, AbstractInitMessage.DEFAULT_VERSION, "0.0.0.0:0", "test-process");
        channel.writeInbound(initRequest);
        channel.writeOutbound(channel.readInbound());

        // Then
        InitResponse initResponse = channel.readOutbound();

        // Assert
        assertNotNull(initResponse);
        assertEquals(initRequest.getId(), initResponse.getId());
        assertEquals(initRequest.version, initResponse.version);
        assertEquals(initRequest.hostPort, initResponse.hostPort);

    }

    @Test
    public void testInvalidCallBeforeInitRequest() throws Exception {
        // Given
        EmbeddedChannel channel = new EmbeddedChannel(
                new InitRequestHandler()
        );


        CallRequest callRequest = Fixtures.callRequestWithId(0);
        channel.writeInbound(callRequest);
        Error error = channel.readOutbound();
        assertThat(error.code, is(Error.ErrorType.FatalProtocolError.byteValue()));

        this.expectedClosedChannelException.expect(ClosedChannelException.class);
        channel.writeOutbound();


    }
}