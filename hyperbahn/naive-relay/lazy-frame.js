'use strict';

var ID_OFFSET = 4;
var TYPE_OFFSET = 2;

module.exports = LazyFrame;

function LazyFrame(sourceConnection, frameBuffer) {
    var self = this;

    self.sourceConnection = sourceConnection;
    self.frameBuffer = frameBuffer;

    self.oldId = null;
    self.newId = null;
    self.frameType = null;
}

LazyFrame.prototype.readId = function readId() {
    var self = this;

    if (self.oldId !== null) {
        return self.oldId;
    }

    self.oldId = self.frameBuffer.readUInt32BE(ID_OFFSET);
    return self.oldId;
};

LazyFrame.prototype.readFrameType = function readFrameType() {
    var self = this;

    if (self.frameType !== null) {
        return self.frameType;
    }

    self.frameType = self.frameBuffer.readUInt8(TYPE_OFFSET);
    return self.frameType;
};

LazyFrame.prototype.writeId = function writeId(newId) {
    var self = this;

    self.frameBuffer.writeUInt32BE(newId, ID_OFFSET);

    self.newId = newId;
    return self.newId;
};
