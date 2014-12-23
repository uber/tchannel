
var farmhash = require('farmhash');

var types = {
	req_complete_message: 0x01,
	req_message_fragment: 0x02,
	req_last_fragment: 0x03,
	res_complete_message: 0x80,
	res_message_fragment: 0x81,
	res_last_fragment: 0x82,
	res_error: 0xC0
};

var states = {
	read_type: 1,
	read_id: 2,
	read_seq: 3,
	read_arg1len: 4,
	read_arg2len: 5,
	read_arg3len: 6,
	read_csum: 7,
	read_arg1: 8,
	read_arg2: 9,
	read_arg3: 10,
	error: 255
};

var emptyBuffer = new Buffer(0);

function TChannelHeader() {
	this.type = null;
	this.id = null;
	this.seq = null;
	this.arg1len = null;
	this.arg2len = null;
	this.arg3len = null;
	this.csum = null;
}

function TChannelFrame() {
	this.header = new TChannelHeader();
	this.options = null;
	this.arg1 = null;
	this.arg2 = null;
	this.arg3 = null;
}

TChannelFrame.prototype.set = function (arg1, arg2, arg3) {
	if (arg2 === undefined || arg2 === null) {
		arg2 = '';
	}
	if (arg3 === undefined || arg3 === null) {
		arg3 = '';
	}

	var type;

	if (Buffer.isBuffer(arg1)) {
		this.arg1 = arg1;
	} else {
		this.arg1 = new Buffer(arg1.toString());
	}
	this.header.arg1len = this.arg1.length;

	if (Buffer.isBuffer(arg2)) {
		this.arg2 = arg2;
	} else {
		if (typeof arg2 === 'object') {
			this.arg2 = new Buffer(JSON.stringify(arg2));
		} else if (typeof arg2 === 'string') {
			this.arg2 = new Buffer(arg2);
		} else {
			this.arg2 = new Buffer(arg2.toString());
		}
	}
	this.header.arg2len = this.arg2.length;

	if (Buffer.isBuffer(arg3)) {
		this.arg3 = arg3;
	} else {
		if (typeof arg3 === 'object') {
			this.arg3 = new Buffer(JSON.stringify(arg3));
		} else if (typeof arg3 === 'string') {
			this.arg3 = new Buffer(arg3);
		} else {
			this.arg3 = new Buffer(arg3.toString());
		}
	}
	this.header.arg3len = this.arg3.length;

	var csum = farmhash.hash32(this.arg1);
	if (this.arg2.length > 0) {
		csum = farmhash.hash32WithSeed(this.arg2, csum);
	}
	if (this.arg3.length > 0) {
		csum = farmhash.hash32WithSeed(this.arg3, csum);
	}
	this.header.csum = csum;
};

TChannelFrame.prototype.toBuffer = function () {
	var header = this.header;
	var buf = new Buffer(25 + header.arg1len + header.arg2len + header.arg3len);
	var offset = 0;

	buf.writeUInt8(header.type, offset, true);
	offset += 1;
	buf.writeUInt32BE(header.id, offset, true);
	offset += 4;
	buf.writeUInt32BE(header.seq, offset, true);
	offset += 4;
	buf.writeUInt32BE(header.arg1len, offset, true);
	offset += 4;
	buf.writeUInt32BE(header.arg2len, offset, true);
	offset += 4;
	buf.writeUInt32BE(header.arg3len, offset, true);
	offset += 4;
	buf.writeUInt32BE(header.csum, offset, true);
	offset += 4;

	this.arg1.copy(buf, offset);
	offset += this.arg1.length;
	this.arg2.copy(buf, offset);
	offset += this.arg2.length;
	this.arg3.copy(buf, offset);
	offset += this.arg3.length;

	return buf;
};


function TChannelParser() {
	this.newFrame = new TChannelFrame();

	this.state = states.read_type;

	this.tmpInt = null;
	this.tmpIntBuf = new Buffer(4);
	this.tmpIntPos = 0;
	this.tmpStr = null;
	this.tmpStrPos = 0;

	this.pos = null;
	this.chunk = null;
}

require('util').inherits(TChannelParser, require('events').EventEmitter);

TChannelParser.prototype.parseError = function(msg) {
	this.emit('error', new Error(msg));
	console.log('parse error: ' + msg);
	this.pos = this.chunk.length;
	this.state = states.error;
};

TChannelParser.prototype.readType = function () {
	var newType = this.chunk[this.pos++];
	this.state = states.read_id;
	this.newFrame.header.type = newType;
};

TChannelParser.prototype.readInt = function () {
	if (this.tmpIntPos === 0 && this.chunk.length >= this.pos + 4) {
		this.tmpInt = this.chunk.readUInt32BE(this.pos, true);
		this.pos += 4;
		return;
	}
	while (this.tmpIntPos < 4 && this.pos < this.chunk.length) {
		this.tmpIntBuf[this.tmpIntPos++] = this.chunk[this.pos++];
	}
	if (this.tmpIntPos === 4) {
		this.tmpInt = this.tmpIntBuf.readUInt32BE(0, true);
		this.tmpIntPos = 0;
	}
};

TChannelParser.prototype.readStr = function (len) {
	if (this.tmpStr === null) {
		if ((this.chunk.length - this.pos) >= len) {
			this.tmpStr = this.chunk.slice(this.pos, this.pos + len);
			this.pos += len;
			this.tmpStrPos = len;
		} else {
			this.tmpStr = new Buffer(len);
			this.chunk.copy(this.tmpStr, 0, this.pos, this.chunk.length);
			this.tmpStrPos = this.chunk.length - this.pos;
			this.pos += (this.chunk.length - this.pos);
		}
	} else {
		var bytesToCopy = Math.min(this.chunk.length, (len - this.tmpStrPos));
		this.chunk.copy(this.tmpStr, this.tmpStrPos, this.pos, this.pos + bytesToCopy);
		this.tmpStrPos += bytesToCopy;
		this.pos += bytesToCopy;
	}
};

TChannelParser.prototype.execute = function (chunk) {
	this.pos = 0;
	this.chunk = chunk;
	var header = this.newFrame.header;

	while (this.pos < chunk.length) {
		if (this.state === states.read_type) {
			this.readType();
		} else if (this.state === states.read_id) {
			this.readInt();
			if (typeof this.tmpInt === 'number') {
				header.id = this.tmpInt;
				this.tmpInt = null;
				this.state = states.read_seq;
			}
		} else if (this.state === states.read_seq) {
			this.readInt();
			if (typeof this.tmpInt === 'number') {
				header.seq = this.tmpInt;
				this.tmpInt = null;
				this.state = states.read_arg1len;
			}
		} else if (this.state === states.read_arg1len) {
			this.readInt();
			if (typeof this.tmpInt === 'number') {
				header.arg1len = this.tmpInt;
				this.tmpInt = null;
				this.state = states.read_arg2len;
			}
		} else if (this.state === states.read_arg2len) {
			this.readInt();
			if (typeof this.tmpInt === 'number') {
				header.arg2len = this.tmpInt;
				this.tmpInt = null;
				this.state = states.read_arg3len;
			}
		} else if (this.state === states.read_arg3len) {
			this.readInt();
			if (typeof this.tmpInt === 'number') {
				header.arg3len = this.tmpInt;
				this.tmpInt = null;
				this.state = states.read_csum;
			}
		} else if (this.state === states.read_csum) {
			this.readInt();
			if (typeof this.tmpInt === 'number') {
				header.csum = this.tmpInt;
				this.tmpInt = null;
				this.state = states.read_arg1;
			}
		} else if (this.state === states.read_arg1) {
			this.readStr(header.arg1len);
			if (this.tmpStrPos === header.arg1len) {
				this.newFrame.arg1 = this.tmpStr;
				this.tmpStr = null;
				this.tmpStrPos = 0;
				if (header.arg2len === 0 && header.arg3len === 0) {
					this.emitAndReset();
					header = this.newFrame.header;
				} else {
					this.state = states.read_arg2;
				}
			}
		} else if (this.state === states.read_arg2) {
			this.readStr(header.arg2len);
			if (this.tmpStrPos === header.arg2len) {
				this.newFrame.arg2 = this.tmpStr;
				this.tmpStr = null;
				this.tmpStrPos = 0;
				if (header.arg3len === 0) {
					this.emitAndReset();
					header = this.newFrame.header;
				} else {
					this.state = states.read_arg3;
				}
			}
		} else if (this.state === states.read_arg3) {
			this.readStr(header.arg3len);
			if (this.tmpStrPos === header.arg3len) {
				this.newFrame.arg3 = this.tmpStr;
				this.emitAndReset();
				header = this.newFrame.header;
			}
		} else if (this.state !== states.error) {
			throw new Error('unknown state ' + this.state);
		}
	}
};

TChannelParser.prototype.emitAndReset = function () {
	this.tmpStr = null;
	this.tmpStrPos = 0;
	if (this.newFrame.header.arg2len === 0) {
		this.newFrame.arg2 = emptyBuffer;
	}
	if (this.newFrame.header.arg3len === 0) {
		this.newFrame.arg3 = emptyBuffer;
	}
	this.emit('frame', this.newFrame);
	this.newFrame = new TChannelFrame();
	this.state = states.read_type;
};

exports.TChannelParser = TChannelParser;
exports.TChannelFrame = TChannelFrame;
exports.TChannelHeader = TChannelHeader;
exports.types = types;


