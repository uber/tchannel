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

import fcntl
import socket
import struct


# TODO This module is unix-only. Figure out something for Windows.


def interface_ip(interface):
    """Determine the IP assigned to us by the given network interface."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    return socket.inet_ntoa(
        fcntl.ioctl(
            sock.fileno(), 0x8915, struct.pack('256s', interface[:15])
        )[20:24]
    )
    # Explanation:
    # http://stackoverflow.com/questions/11735821/python-get-localhost-ip
    # http://stackoverflow.com/questions/24196932/how-can-i-get-the-ip-address-of-eth0-in-python


def local_ip():
    """Get the local network IP of this machine"""
    ip = socket.gethostbyname(socket.gethostname())
    if ip.startswith('127.'):
        # Check eth0, eth1, eth2, en0, ...
        interfaces = [
            i + str(n) for i in ("eth", "en", "wlan") for n in xrange(3)
        ]  # :(
        for interface in interfaces:
            try:
                ip = interface_ip(interface)
                break
            except IOError:
                pass
    return ip
