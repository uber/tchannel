# Copyright (c) 2015 Uber Technologies, Inc.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

from __future__ import absolute_import

import inspect
import logging
import os
import sys
from functools import partial

import tornado.gen
import tornado.ioloop
import tornado.iostream
import tornado.tcpserver
from tornado.netutil import bind_sockets

from . import hyperbahn
from .. import scheme
from ..enum import enum
from ..event import EventEmitter
from ..event import EventRegistrar
from ..handler import CallableRequestHandler
from ..net import local_ip
from ..zipkin.zipkin_trace import ZipkinTraceHook
from .broker import ArgSchemeBroker
from .connection import StreamConnection
from .dispatch import RequestDispatcher
from .peer import PeerGroup

log = logging.getLogger('tchannel')


State = enum(
    'State',
    ready=0,
    closing=1,
    closed=2,
)


class TChannel(object):
    """Manages inbound and outbound connections to various hosts."""

    _SCHEMES = {
        'raw': scheme.RawArgScheme,
        'json': scheme.JsonArgScheme,
        # 'http': scheme.HttpArgScheme, TODO
    }

    def __init__(self, name, hostport=None, process_name=None,
                 known_peers=None, trace=False):
        """Build or re-use a TChannel.

        :param name:
            Name is used to identify client or service itself.
        :param hostport:
            The host-port at which the service behind this TChannel is
            reachable. The port specified in the ``hostport`` is what the
            server will listen on. If unspecified, the system will attempt to
            determine the local network IP for this host and use an
            OS-assigned port.
        :param process_name:
            Name of this process. This is used for logging only. If
            unspecified, this will default to ``$processName[$processId]``.
        :param known_peers:
            A list of host-ports at which already known peers can be reached.
            Defaults to an empty list.
        :param trace:
            Flag to turn on/off zipkin trace. It can be a bool variable or
            a function that return true or false.
        """
        self._state = State.ready
        self._handler = RequestDispatcher()

        self.peers = PeerGroup(self)

        self._port = 0
        self._host = None
        if hostport:
            self._host, port = hostport.rsplit(':', 1)
            self._port = int(port)

        if not self._host:
            # TChannel(":4040") => determine IP automatically but use port
            # 4040
            self._host = local_ip()

        self.process_name = process_name or "%s[%s]" % (
            sys.argv[0], os.getpid()
        )

        self.name = name
        self._trace = trace

        # register event hooks
        self.event_emitter = EventEmitter()
        self.hooks = EventRegistrar(self.event_emitter)
        self.hooks.register(ZipkinTraceHook(tchannel=self))

        if known_peers:
            for peer_hostport in known_peers:
                self.peers.add(peer_hostport)

    @property
    def trace(self):
        if callable(self._trace):
            return self._trace()
        else:
            return self._trace

    def advertise(self, router, name=None):
        """Advertise the given TChannel to Hyperbahn.

        This informs Hyperbahn that the given client/service is using TChannel
        at a fixed rate.

        It also tells the TChannel about the given Hyperbahn routers.

        :param routers:
            Seed list of addresses of Hyperbahn routers
        :param name:
            Name to be register on the hyperbahn.
        :returns:
            A future that resolves to the remote server's response after
            the first advertise finishes.
        """
        name = name or self.name
        return hyperbahn.advertise(self, name, router)

    @property
    def closed(self):
        return self._state == State.closed

    @tornado.gen.coroutine
    def close(self):
        if self._state in [State.closed, State.closing]:
            raise tornado.gen.Return(None)

        self._state = State.closing
        try:
            yield self.peers.clear()
        finally:
            self._state = State.closed

    @property
    def hostport(self):
        return "%s:%d" % (self._host, self._port)

    def request(self,
                hostport=None,
                service=None,
                arg_scheme=None,
                retry=None,
                **kwargs):
        """Initiate a new request through this TChannel.

        :param hostport:
            Host to which the request will be made. If unspecified,  a random
            known peer will be picked.
        :param service:
            Service being called. Defaults to an empty string.
        :param arg_scheme:
            Arg scheme type.
        :param rety:
            Retry flag
        """
        return self.peers.request(hostport=hostport,
                                  service=service,
                                  arg_scheme=arg_scheme,
                                  retry=retry,
                                  **kwargs)

    def listen(self, port=None):
        """Start listening for incoming connections.

        A request handler must have already been specified with
        ``TChannel.host``.

        :param port: the port that tchannel listens on
        """
        if port:
            assert not self._port, "Port has already been set."
            self._port = int(port)

        assert self._handler, "Call .host with a RequestHandler first"
        server = TChannelServer(self)

        sockets = bind_sockets(self._port)
        assert sockets, "No sockets bound for port %d" % self._port

        # If port was 0, the OS probably assigned something better.
        self._port = sockets[0].getsockname()[1]

        server.add_sockets(sockets)

    @tornado.gen.coroutine
    def receive_call(self, message, connection):
        if not self._handler:
            log.warn(
                "Received %s but a handler has not been defined.", str(message)
            )
            return
        self._handler.handle(message, connection)

    def _register_simple(self, endpoint, scheme, f):
        """Register a simple endpoint with this TChannel.

        :param endpoint:
            Name of the endpoint being registered.
        :param scheme:
            Name of the arg scheme under which the endpoint will be
            registered.
        :param f:
            Callable handler for the endpoint.
        """
        assert scheme in self._SCHEMES, ("Unsupported arg scheme %s" % scheme)
        scheme = self._SCHEMES[scheme]()
        self._handler.register(endpoint, f, ArgSchemeBroker(scheme))
        return f

    def _register_thrift(self, service_module, handler, **kwargs):
        """Register a Thrift endpoint on this TChannel.

        :param service_module:
            Reference to the Thrift-generated module for the service being
            registered.
        :param handler:
            Handler for the endpoint
        :param method:
            Name of the Thrift method being registered. If omitted, ``f``'s
            name is assumed to be the method name.
        :param service:
            Name of the Thrift service. By default this is determined
            automatically from the module name.
        """
        import tchannel.thrift as thrift
        # Imported inside the function so that we don't have a hard dependency
        # on the Thrift library. This function is usable only if the Thrift
        # library is installed.
        thrift.register(self._handler, service_module, handler, **kwargs)
        return handler

    def register(self, endpoint, scheme=None, handler=None, **kwargs):
        """Register a handler with this TChannel.

        This may be used as a function or as a decorator.

        .. code-block:: python

            app = TChannel()

            @app.register("hello", "json")
            def hello(request, response, tchannel):
                # ...

            app.register(Foo, "thrift", handler_func)

        :param endpoint:
            Name of the endpoint being registered for raw and JSON arg
            schemes. Reference to the Thrift-generated module for the Thrift
            arg scheme.
        :param scheme:
            Name of the scheme under which the endpoint is being registered.
            One of ``raw``, ``json``, and ``thrift``. Defaults to "raw",
            except if ``endpoint`` was a module, in which case this defaults
            to "thrift".
        :param handler:
            If specified, this is the handler function. If ignored, this
            function returns a decorator that can be used to register the
            handler function.
        :returns:
            If ``handler`` was specified, this returns ``handler``. Otherwise,
            it returns a decorator that can be applied to a function to
            register it as the handler.
        """
        assert endpoint, "endpoint is required"

        if not scheme:
            # scheme defaults to raw, unless the endpoint is a service module.
            if inspect.ismodule(endpoint):
                scheme = "thrift"
            else:
                scheme = "raw"
        scheme = scheme.lower()

        if scheme == 'thrift':
            decorator = partial(self._register_thrift, endpoint, **kwargs)
        else:
            decorator = partial(
                self._register_simple, endpoint, scheme, **kwargs
            )

        if handler is not None:
            return decorator(handler)
        else:
            return decorator


class TChannelServer(tornado.tcpserver.TCPServer):
    __slots__ = ('tchannel',)

    def __init__(self, tchannel):
        super(TChannelServer, self).__init__()
        self.tchannel = tchannel

    @tornado.gen.coroutine
    def handle_stream(self, stream, address):
        log.debug("New incoming connection from %s:%d" % address)

        conn = StreamConnection(connection=stream, tchannel=self.tchannel)

        yield conn.expect_handshake(headers={
            'host_port': self.tchannel.hostport,
            'process_name': self.tchannel.process_name,
        })

        log.debug(
            "Successfully completed handshake with %s:%s (%s)",
            conn.remote_host,
            conn.remote_host_port,
            conn.remote_process_name)

        self.tchannel.peers.get(
            "%s:%s" % (conn.remote_host,
                       conn.remote_host_port)
        ).register_incoming(conn)

        yield conn.serve(handler=CallableRequestHandler(self._handle))

    def _handle(self, message, connection):
        self.tchannel.receive_call(message, connection)
