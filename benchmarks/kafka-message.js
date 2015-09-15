// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/*jshint maxparams: 8 */
'use strict';

/*
0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       REQUEST_LENGTH                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|        REQUEST_TYPE           |        TOPIC_LENGTH           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/                                                               /
/                             TOPIC                             /
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           PARTITION                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/                       REQUEST HEADER (above)                  /
/                                                               /
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         MESSAGES_LENGTH                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/                                                               /
/                           MESSAGES                            /
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

0                    1                  2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                             LENGTH                            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|     MAGIC     |  COMPRESSION  |          CHECKSUM             |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|      CHECKSUM (cont.)         |         PAYLOAD               /
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+                               /
/                         PAYLOAD (cont.)                       /
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
*/

module.exports = parseMessage;

function parseMessage(msg) {
    var records = [];

    var recordOffset = 0;

    while (recordOffset < msg.length) {
        var length = msg.readUInt32BE(recordOffset);

        var type = msg.readUInt16BE(recordOffset + 4);
        var topicLength =
            msg.readUInt16BE(recordOffset + 6);
        var topic = msg.slice(
            recordOffset + 8, recordOffset + 8 + topicLength);
        var partition =
            msg.readUInt32BE(recordOffset + 8 + topicLength);

        var remainder = msg .slice(
            recordOffset + 12 + topicLength,
            recordOffset + 4 + length);

        var messagesLength = remainder.readUInt32BE(0);
        var messages = remainder.slice(4, 4 + messagesLength);
        var messageStructs = [];

        var messageOffset = 0;

        while (messageOffset < messagesLength) {
            var mLength = messages.readUInt32BE(messageOffset);
            var mMagic = messages
                .readUInt8(messageOffset + 4);
            var mCompression = messages
                .readUInt8(messageOffset + 5);
            var mChecksum = messages
                .readUInt32BE(messageOffset + 6);

            var mPayload = messages
                .slice(10, mLength + 4);

            messageStructs.push(new KafkaMessage(
                mLength,
                mMagic,
                mCompression,
                mChecksum,
                JSON.parse(String(mPayload))
            ));
            messageOffset = messageOffset + (mLength + 4);
        }

        records.push(new KafkaRequest(
            length,
            type,
            topicLength,
            String(topic),
            partition,
            messagesLength,
            messageStructs
        ));
        recordOffset = recordOffset + length + 4;
    }

    return records;
}

// @constructor
/* eslint-disable max-params */
function KafkaMessage(
    length, magic, compression, checksum, payload
) {
    this.length = length;
    this.magic = magic;
    this.compression = compression;
    this.checksum = checksum;
    this.payload = payload;
}
/* eslint-enable max-params */

// @constructor
/* eslint-disable max-params */
function KafkaRequest(
    length, type, topicLength, topic, partition, mLength, msgs
) {
    this.length = length;
    this.type = type;
    this.topicLength = topicLength;
    this.topic = topic;
    this.partition = partition;
    this.messagesLength = mLength;
    this.messages = msgs;
}
/* eslint-enable max-params */
