class RequestHandler(object):

    def __init__(self):
        pass

    def handle_request(self, context, conn):
        raise NotImplementedError


class TChannelRequestHandler(RequestHandler):
    def __init__(self):
        self.endpoints = {}

    def handle_request(self, context, conn):
        """Handle incoming request

        :param context: incoming message context
        :param conn: incoming connection
        """
        request = TChannelRequest(context, conn)
        endpoint = self._find_endpoint(request.method)
        if endpoint is not None:
            response = TChannelResponse(conn)
            endpoint["handler"](request, response, endpoint["opts"])
            response.finish()

    def route(self, rule, **opts):
        def decorator(handler):
            self.register_handler(rule, handler, **opts)
            return handler

        return decorator

    def register_handler(self, rule, handler, **opts):
        self.endpoints[rule] = {
            "handler": handler,
            "opts": opts
        }

    def _find_endpoint(self, rule):
        return self.endpoints.get(rule, None)


class TChannelRequest(object):
    """ TChannel Request Wrapper """

    def __init__(self, context, conn):
        self.message = context.message
        self.header = self.message.arg_2
        self.body = self.message.arg_3
        self.method = self.message.arg_1
        self.connection = conn

        # TODO fill up more attributes


class TChannelResponse(object):
    """ TChannel Response Wrapper """

    def __init__(self, conn):
        self._connection = conn

    def write(self, msg):
        self._connection.write(msg)

    def finish(self):
        self._connection.finish()
