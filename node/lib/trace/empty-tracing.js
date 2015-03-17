var emptyTracing = module.exports = {
    traceid: new Buffer(8),
    spanid: new Buffer(8),
    parentid: new Buffer(8),
    flags: 0
};

emptyTracing.traceid.fill(0);
emptyTracing.spanid.fill(0);
emptyTracing.parentid.fill(0);

