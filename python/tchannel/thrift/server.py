from __future__ import absolute_import

from ..handler import RequestHandler

# Ignore this file for now. This is just a placeholder to add all the
# server-side support.


def processor(thrift_module, implementation_class, exception_logger=None):
    # TODO probably lift from clay_thrift/common.py
    raise NotImplementedError()


class ThriftRequestHandler(RequestHandler):
    """A RequestHandler that delegates calls to a Thrift processor.

    .. code-block::

        handler = ThriftRequestHandler()

        handler.register(
            "UserService",
            processor(
                blog_service.thrift.service.UserService,
                UserServiceHandler,
            ),
        )

        handler.register(
            "PostService",
            processor(
                blog_service.thrift.service.PostService,
                PostServiceHandler,
            )
        )
    """

    __slots__ = ('services',)

    def __init__(self):
        super(ThriftRequestHandler, self).__init__()
        self.services = {}

    def register(self, service_name, processor):
        self.services[service_name] = processor

    def handle_request(self, context, connection):
        raise NotImplementedError()
