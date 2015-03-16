from __future__ import absolute_import

import sys
from concurrent.futures import Future


class SettableFuture(Future):
    """Future with support for `set_result` and `set_exception`."""
    # These operations are implemented in Future but are not part of the
    # "public interface". This class makes the dependency on those methods
    # more concrete. If the methods ever get removed, we can implement our own
    # versions.

    def set_result(self, result):
        """Set the result of this Future to the given value.

        All consumers waiting on the output of this future will unblock.

        :param result:
            Result value of the future
        """
        return super(SettableFuture, self).set_result(result)

    def set_exception(self, exception=None, traceback=None):
        """Put an exception into this Future.

        All blocked `result()` calls will re-raise the given exception. If the
        exception or the traceback is omitted, they will automatically be
        determined using `sys.exc_info`.

        :param exception:
            Exception for the Future
        :param traceback:
            Traceback of the exception
        """
        if not exception or not traceback:
            exception, traceback = sys.exc_info()[1:]
        super(SettableFuture, self).set_exception_info(exception, traceback)
