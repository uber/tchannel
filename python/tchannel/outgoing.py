from __future__ import absolute_import

import enum
import socket
from functools import partial

from .socket import SocketConnection
from .messages import CallRequestMessage


class TChannelException(Exception):
    """Base class for TChannel-related exceptions."""
    pass


class TChannelApplicationException(TChannelException):
    """The remote application returned an exception.
    
    This is not a protocol error. This means a response was received with the
    ``code`` flag set to fail."""
    def __init__(self, code, arg_1, arg_2, arg_3):
        super(TChannelException, self).__init__(
            'TChannel application error (%s, %s, %s)' % (arg_1, arg_2, arg_3)
        )

        self.code = code
        self.arg_1 = arg_1
        self.arg_2 = arg_2
        self.arg_3 = arg_3


class TChannelOutOps(object):
    """Encapsulates outgoing operations for a TChannel connection."""

    @enum.unique
    class State(enum.IntEnum):
        init = 0
        ready = 1
        closed = 2

    def __init__(self, name, sock, on_close=None, perform_handshake=True):
        """Initialize a TChannelOutOps.

        :param name:
            Name of the current process.
        :param sock:
            Socket connection to the destination
        :param on_close:
            Function to call (without `self` as the only argument) when the
            connection is closed
        :param perform_handshake:
            If True (the default), perform a handshake with the remote host
            immediately
        """
        self._name = name
        self._sock = sock
        self._conn = SocketConnection(self._sock)

        self._state = self.State.init
        self._on_close = on_close or (lambda x: x)

        if perform_handshake:
            self.handshake()

    def handshake(self):
        """Perform a handshake with the remote host over the given connection.

        No-op if the handshake was already performed.
        """
        assert (
            not self._state == self.State.closed
        ), "The connection to %s:%s has already been terminated." % (
            self.host, self.port
        )

        if self._state != self.State.init:
            return

        self._conn.initiate_handshake({
            'host_port': '0.0.0.0:0',  # We can't receive requests
            'process_name': self._name
        })
        self._conn.await_handshake_reply()
        self._state = self.State.ready

    def send(self, arg_1, arg_2, arg_3, service=None):
        """Send the given arguments over the wire.

        ``arg_1``, ``arg_2``, and ``arg_3`` are represent the triple being
        sent over the wire.

        `service` is the name of the service being called. Defaults to an
        empty string.
        """
        assert (
            self._state == self.State.ready
        ), "Handshake not performed or connection closed"

        msg = CallRequestMessage()
        msg.service = service or ''
        msg.arg_1 = arg_1
        msg.arg_2 = arg_2
        msg.arg_3 = arg_3
        msg.checksum_type = 0
        msg.checksum = 0
        msg.flags = 0
        msg.headers = {}
        msg.parent_id = 0
        msg.span_id = 0
        msg.trace_id = 0
        msg.traceflags = 0
        msg.ttl = 1
        # wat

        self._conn.frame_and_write(msg)
        response = self._conn.await(lambda ctx: ctx.message)

        if response.code != 0:
            raise TChannelApplicationException(
                response.code, response.arg_1, response.arg_2, response.arg_3
            )

        return response.arg_1, response.arg_2, response.arg_3

    def closed(self):
        """Returns True if the connection has been closed."""
        return self._state == self.State.closed

    def close(self):
        """Manually close this connection

        It is generally not necessary to call this manually because the
        TChannel instance will clean up after itself.
        """
        if not self.closed():
            self._sock.close()
            self._state = self.State.closed
            self._on_close(self)

    def __del__(self):
        try:
            self.close()
        except:
            pass


class OutgoingTChannel(object):
    """Manages outgoing TChannel connections.

    Example usage,

    .. code-block::

        with OutgoingTChannel('service_name') as chan:
            resp = chan.request('localhost:4040').send(
                'func 1', 'arg 1', 'arg 2'
            )

    All open connections are automatically closed when the context manager
    exits.

    This class is NOT thread-safe.
    """
    # FIXME: Make me thread safe

    def __init__(self, name):
        """Initialize an OutgoingTChannel with the given process name.

        :param name:
            Process name used when talking to remote servers. This is used for
            logging only.
        """
        assert name, 'A process name is required'
        self._name = name
        self._connections = {}

    def _get_connection(self, host, port):
        """Get a TChannel connection to the given destination.

        :param host:
            Remote host
        :param port:
            Port to connect on
        """
        assert host, "host is required"
        assert port, "port is required"

        conn = self._connections.get((host, port))
        if conn:
            return conn

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((host, port))

        conn = self._connections[(host, port)] = TChannelOutOps(
            self._name,
            sock,
            on_close=partial(self._on_conn_close, host=host, port=port),
        )
        return conn

    def _on_conn_close(self, host, port, connection):
        self._connections.pop((host, port), None)

    def request(self, host, port=None):
        """Prepare to make a request to the given destination.

        Accepts either a `host` and `port` specifying the destination, or a
        string in the form `host:port`. This call sets up a connection to the
        destination right away (if one did not already exist). The returned
        object can be used to make calls to the destination.

        .. code-block::

            conn = chan.request('localhost:4040')
            try:
                (a, b, c) = conn.send('/health-check', '', '')
            except TChannelApplicationException as e:
                (d, e, f) = e.arg_1, e.arg_2, e.arg_3

        :param host:
            Remote host
        :param port:
            Port on the remote host
        """
        if not port:
            host, port = host.rsplit(':', 1)
        port = int(port)
        return self._get_connection(host, port)

    def close(self):
        for conn in self._connections.values():
            try:
                conn.close()
            except socket.error:
                pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def __del__(self):
        try:
            self.close()
        except:
            pass
