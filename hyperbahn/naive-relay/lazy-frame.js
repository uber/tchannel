'use strict';

var ID_OFFSET = 4;
var TYPE_OFFSET = 2;

LazyFrame.freeList = [];
for (var i = 0; i < 1000; i++) {
    LazyFrame.freeList.push(new LazyFrame());
}

LazyFrame.alloc = allocLazyFrame;
LazyFrame.free = freeLazyFrame;

module.exports = LazyFrame;

function allocLazyFrame(sourceConnection, frameBuffer) {
    var frame;

    if (LazyFrame.freeList.length === 0) {
        frame = new LazyFrame();
    } else {
        frame = LazyFrame.freeList.pop();
    }

    frame.sourceConnection = sourceConnection;
    frame.frameBuffer = frameBuffer;

    return frame;
}

function freeLazyFrame(frame) {
    frame.sourceConnection = null;
    frame.frameBuffer = null;
    frame.oldId = null;
    frame.newId = null;
    frame.frameType = null;

    LazyFrame.freeList.push(frame);
}

function LazyFrame() {
    var self = this;

    self.sourceConnection = null;
    self.frameBuffer = null;

    self.oldId = null;
    self.newId = null;
    self.frameType = null;
}

LazyFrame.prototype.readId = function readId() {
    var self = this;

    if (self.oldId !== null) {
        return self.oldId;
    }

    self.oldId = self.frameBuffer.readUInt32BE(ID_OFFSET, true);
    return self.oldId;
};

LazyFrame.prototype.readFrameType = function readFrameType() {
    var self = this;

    if (self.frameType !== null) {
        return self.frameType;
    }

    self.frameType = self.frameBuffer.readUInt8(TYPE_OFFSET, true);
    return self.frameType;
};

LazyFrame.prototype.writeId = function writeId(newId) {
    var self = this;

    self.frameBuffer.writeUInt32BE(newId, ID_OFFSET, true);

    self.newId = newId;
    return self.newId;
};
