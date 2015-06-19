'use strict';

var test = require('tape');

test('register with autobahn + error frame');
test('register with autobahn + error frame + no hardFail');

// TODO test registationTimeout semantics
test('register with invalid serviceName');
test('register with invalid host port');
test('register with unexpected autobahn failure');
test('register with invalid serviceName + no hardFail');
test('register with invalid host port + no hardFail');
test('register with unexpected autobahn failure + no hardFail');

test('register in a loop');

test('calling register() after destroy');
test('calling getClientSubChannel() after destroy');
