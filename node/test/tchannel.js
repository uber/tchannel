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

'use strict';

var test = require('tape');
var TChannel = require('../index.js');

var serverOptions = {host: '127.0.0.1', port: 4040};
var clientOptions = {host: '127.0.0.1', port: 4041};
var client1Options = {host: '127.0.0.1', port: 4042};
var serverName = serverOptions.host + ':' + serverOptions.port;
var clientName = clientOptions.host + ':' + clientOptions.port;
var client1Name = client1Options.host + ':' + client1Options.port;


test('add peer: refuse to add self', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    assert.throws(function () {
      server.addPeer(serverName);
    }, new Error('refusing to add self peer'),
      'Should refuse to add self as a peer');
    server.quit(assert.end);
  });
});


test('add peer: should successfully add peer', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    assert.doesNotThrow(function () {
      server.addPeer(clientName);
    }, new Error('refusing to add self peer'),
      'Should successfully add peer');
    server.quit(assert.end);
  });
});


test('add peer: get connection', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    var connection = server.addPeer(clientName);

    assert.ok(connection, 'A connection object should be returned');
    assert.equals(connection.remoteAddr, '127.0.0.1:4041', 'Remote address should match the client');
    server.quit(assert.end);
  });
});


test('set peer: refuse to set self', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    assert.throws(function () {
      server.setPeer(serverName);
    }, new Error('refusing to set self peer'),
      'Should refuse to set self as a peer');
    server.quit(assert.end);
  });
});


test('set peer: should successfully set peer', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    var conn = server.makeOutConnection(clientName);
    assert.doesNotThrow(function () {
      server.setPeer(clientName, conn);
    }, new Error('refusing to set self peer'),
      'Should successfully set peer');
    server.quit(assert.end);
  });
});


test('set peer: get connection', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    var conn = server.makeOutConnection(clientName);
    var connection = server.setPeer(clientName, conn);

    assert.ok(connection, 'A connection object should be returned');
    assert.equals(connection.remoteAddr, '127.0.0.1:4041', 'Remote address should match the client');
    server.quit(assert.end);
  });
});


test('get peer: should fail to get non existent peer', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    var peer = server.getPeer("idontexist");

    assert.notOk(peer, 'Non existent peer should not be retuned');
    server.quit(assert.end);
  });
});


test('get peer: should return requested peer', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    server.addPeer(clientName);
    assert.equals(clientName, server.getPeer(clientName).remoteAddr,
      'The added peer should be returned');
    server.quit(assert.end);
  });
});


test('get peers: should get all peers', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    server.addPeer(clientName);
    server.addPeer(client1Name);
    assert.equals(server.getPeers().length, 2);
    assert.equals(clientName, server.getPeers()[0].remoteAddr,
      'Peer added first should be returned');
    assert.equals(client1Name, server.getPeers()[1].remoteAddr,
      'Peer added second should be returned');
    server.quit(assert.end);
  });
});


test('remove peer: should remove requested peer', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    server.removePeer(clientName, server.addPeer(clientName));
    assert.notOk(server.getPeer(clientName),
      'Added peer should have been deleted. Nothing should be returned');
    server.quit(assert.end);
  });
});


test('getOut connection: get for existing peer', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    server.addPeer(clientName);

    assert.ok(server.getOutConnection(clientName),
      'Added connection should be returned');
    assert.equals(server.getOutConnection(clientName).remoteAddr, clientName,
      'Remote address should match the client');
    server.quit(assert.end);
  });
});


test('getOut connection: add and get for provided peer', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    assert.ok(server.getOutConnection(clientName),
      'Added connection should be returned');
    assert.equals(server.getOutConnection(clientName).remoteAddr, clientName,
      'Remote address should match the client');
    server.quit(assert.end);
  });
});


test('make socket: should throw for invalid destination', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    assert.throws(function () {
      server.makeSocket('localhost');
    }, new Error('invalid destination'),
      'Should reject invalid destination');
    server.quit(assert.end);
  });
});


//makeSocket creates net.createConnection. Can't test it as of now.
// also cant test makeOutConnection for same reason.
//test('make socket: should create for valid destination', function t(assert) {
//  
//  var server = new TChannel();
//  server.listen(serverOptions.port, serverOptions.host);
//  
//  assert.doesNotThrow(function() {
//    server.makeSocket(clientName);
//  }, new Error('invalid destination'),
//    'Should reject invalid destination');
//  assert.end();
//});
