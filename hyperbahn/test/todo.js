'use strict';

var test = require('tape');

test('forwarding a 80kb payload');
test('calling connections for non-existant service');
test('calling connections with exit nodes down');
test('register two services on one hostPort fails');
test('send register to entry who is also exit');
test('creating a logger');
test('forwarding a call response not ok');
test('forwarding a error frame from a service');
test('sending a message to autobahn with empty service');
test('sending an unknown arg1 to autobahn for service autobahn');
test('calling the repl_port endpoint');
test('sending corrupted json to autobahn arg2');
test('sending corrupted json to autobahn arg3');
test('decrement k by a set value');
test('advertising during a restart does not error');
