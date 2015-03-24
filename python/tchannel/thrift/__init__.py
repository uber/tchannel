from __future__ import absolute_import

try:
    import thrift  # noqa
except ImportError:
    raise ImportError(
        "The thrift library must be installed to use tchannel.thrift"
    )
