# Copyright (c) 2015 Uber Technologies, Inc.
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

ParseBuffer = ->
    self = this
    self.buffer = Buffer(0)
    return

'use strict'
module.exports = ParseBuffer

ParseBuffer::avail = ->
    self = this
    self.buffer.length

ParseBuffer::free = ->
    0

ParseBuffer::clear = ->
    self = this
    self.buffer = Buffer(0)
    return

ParseBuffer::push = (chunk) ->
    self = this
    if self.buffer.length
        self.buffer = Buffer.concat([
            self.buffer
            chunk
        ], self.buffer.length + chunk.length)
    else
        self.buffer = chunk
    return

ParseBuffer::shift = (n) ->
    self = this
    chunk = undefined
    if self.buffer.length < n
        chunk = Buffer(0)
    else if self.buffer.length > n
        chunk = self.buffer.slice(0, n)
        self.buffer = self.buffer.slice(n)
    else
        chunk = self.buffer
        self.buffer = Buffer(0)
    chunk

ParseBuffer::readUInt8 = (offset) ->
    self = this
    self.buffer.readUInt8 offset

ParseBuffer::readUInt16BE = (offset) ->
    self = this
    self.buffer.readUInt16BE offset

ParseBuffer::readUInt32BE = (offset) ->
    self = this
    self.buffer.readUInt32BE offset

# TODO: split out and complete buffer api
