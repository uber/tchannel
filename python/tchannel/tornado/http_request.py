import copy
import time
from tornado.escape import parse_qs_bytes
from tornado.httputil import parse_body_arguments


class HttpRequest(object):
    def __init__(self, method=None, uri=None, version="HTTP/1.0", headers=None,
                 body=None, host=None, files=None, connection=None,
                 start_line=None):
        if start_line is not None:
            method, uri, version = start_line
        self.method = method or b""
        self.uri = uri or b""
        self.version = version
        self.headers = headers
        self.body = body or b""

        # set remote IP and protocol
        context = getattr(connection, 'context', None)
        self.remote_ip = "0.0.0.0"
        self.protocol = getattr(context, 'protocol', "http")

        self.host = host or self.headers.get("Host") or "127.0.0.1"
        self.files = files or {}
        self.connection = connection
        self._start_time = time.time()
        self._finish_time = None

        self.path, sep, self.query = uri.partition('?')
        self.arguments = parse_qs_bytes(self.query, keep_blank_values=True)
        self.query_arguments = copy.deepcopy(self.arguments)
        self.body_arguments = {}

    def supports_http_1_1(self):
        """Returns True if this request supports HTTP/1.1 semantics.

        .. deprecated:: 4.0
           Applications are less likely to need this information with the
           introduction of `.HTTPConnection`.  If you still need it, access
           the ``version`` attribute directly.
        """
        return self.version == "HTTP/1.1"

    @property
    def cookies(self):
        """A dictionary of Cookie.Morsel objects."""
        # TODO cookies
        return self._cookies

    def write(self, chunk, callback=None):
        """Writes the given chunk to the response stream.

        .. deprecated:: 4.0
           Use ``request.connection`` and the `.HTTPConnection` methods
           to write the response.
        """
        self.connection.write(chunk, callback=callback)

    def finish(self):
        """Finishes this HTTP request on the open connection.

        .. deprecated:: 4.0
           Use ``request.connection`` and the `.HTTPConnection` methods
           to write the response.
        """
        self.connection.finish()
        self._finish_time = time.time()

    def full_url(self):
        """Reconstructs the full URL for this request."""
        return self.protocol + "://" + self.host + self.uri

    def request_time(self):
        """Returns the amount of time it took for this request to execute."""
        if self._finish_time is None:
            return time.time() - self._start_time
        else:
            return self._finish_time - self._start_time

    def get_ssl_certificate(self, binary_form=False):
        # TODO ssl
        return None

    def _parse_body(self):
        parse_body_arguments(
            self.headers.get("Content-Type", ""), self.body,
            self.body_arguments, self.files,
            self.headers)

        for k, v in self.body_arguments.items():
            self.arguments.setdefault(k, []).extend(v)

    def __repr__(self):
        attrs = ("protocol", "host", "method", "uri", "version", "remote_ip")
        args = ", ".join(["%s=%r" % (n, getattr(self, n)) for n in attrs])
        return "%s(%s, headers=%s)" % (
            self.__class__.__name__, args, dict(self.headers))
