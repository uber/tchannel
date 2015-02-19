from __future__ import absolute_import

try:
    from cStringIO import StringIO as BytesIO
except ImportError:  # pragma: no cover
    from io import BytesIO  # noqa
