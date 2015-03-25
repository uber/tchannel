import collections
from .messages import CallResponseMessage

Endpoint = collections.namedtuple('Endpoint', ['handler', 'opts'])


class RequestHandler(object):
    """Base class for request handlers.

    Usage example:
        class CustomerReqHandler(RequestHandler):
            def handle_request(self, context, conn):
                Add customized request handling
                logic here

    """
    def handle_request(self, context, conn):
        """Handle incoming request

        :param context: context contains received CallRequestMessage
        :param conn: An incoming TornadoConnection
        """
        raise NotImplementedError()


class TChannelRequestHandler(RequestHandler):
    def __init__(self):
        super(TChannelRequestHandler, self).__init__()
        self.endpoints = {}

    def handle_request(self, context, conn):
        """dispatch incoming request to particular endpoint

        :param context: context contains received CallRequestMessage
        :param conn: An incoming TornadoConnection
        """
        request = TChannelRequest(context, conn)
        endpoint = self._find_endpoint(request.method)
        if endpoint is not None:
            response = TChannelResponse(request, conn)
            try:
                endpoint.handler(request, response, endpoint.opts)
            except:
                # TODO add tchannel error handling here
                pass
            finally:
                response.finish()
        else:
            # TODO error handling if endpoint is not found
            raise NotImplementedError()

    def route(self, rule, **opts):
        def decorator(handler):
            self.register_handler(rule, handler, **opts)
            return handler

        return decorator

    def register_handler(self, rule, handler, **opts):
        self.endpoints[rule] = Endpoint(handler=handler, opts=opts)

    def _find_endpoint(self, rule):
        return self.endpoints.get(rule, None)


class TChannelRequest(object):
    """TChannel Request Wrapper"""

    __slots__ = ('message', 'header',
                 'body', 'method',
                 'connection', 'context',
                 'id')

    def __init__(self, context, conn):
        self.message = context.message
        self.header = self.message.arg_2
        self.body = self.message.arg_3
        self.method = self.message.arg_1
        self.connection = conn
        self.context = context
        self.id = context.message_id

        # TODO fill up more attributes


class TChannelResponse(object):
    """TChannel Response Wrapper"""

    __slots__ = ('_connection', '_request',
                 'resp_msg', 'id')

    def __init__(self, request, conn):
        self._connection = conn
        self._request = request
        self.resp_msg = CallResponseMessage()
        self.id = request.id

    def write(self, chunk):
        # build response message
        self.resp_msg.arg_3 += chunk

    def finish(self):
        self._connection.finish(self)
        self.resp_msg = CallResponseMessage()

    def update_resp_id(self):
        self.id += 1
