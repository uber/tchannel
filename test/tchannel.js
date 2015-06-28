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
var TChannel = require('../channel.js');

var serverOptions = {host: '127.0.0.1', port: 14045};
var clientOptions = {host: '127.0.0.1', port: 14046};
var client1Options = {host: '127.0.0.1', port: 14047};
var clientName = clientOptions.host + ':' + clientOptions.port;
var client1Name = client1Options.host + ':' + client1Options.port;


test('add peer: should successfully add peer', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    assert.doesNotThrow(function () {
      server.peers.add(clientName).connect();
    }, 'Should successfully add peer');
    server.quit(assert.end);
  });
});


test('add peer: get connection', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    var connection = server.peers.add(clientName).connect();

    assert.ok(connection, 'A connection object should be returned');
    assert.equals(connection.socketRemoteAddr, '127.0.0.1:14046', 'Remote address should match the client');
    server.quit(assert.end);
  });
});


test('peer add, connect', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    var connection = server.peers.add(clientName).connect();
    assert.ok(connection, 'A connection object should be returned');
    assert.equals(connection.socketRemoteAddr, '127.0.0.1:14046', 'Remote address should match the client');
    server.quit(assert.end);
  });
});


test('get peer: should fail to get non existent peer', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    var peer = server.peers.get("idontexist");

    assert.notOk(peer, 'Non existent peer should not be retuned');
    server.quit(assert.end);
  });
});


test('get peer: should return requested peer', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    server.peers.add(clientName).connect();
    assert.equals(clientName,
      server.peers.get(clientName).connections[0].socketRemoteAddr,
      'added peer connection');
    server.quit(assert.end);
  });
});


test('get peers: should get all peers', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    server.peers.add(clientName).connect();
    server.peers.add(client1Name).connect();
    var peers = server.peers.values();
    assert.equals(peers.length, 2);
    assert.equals(clientName, peers[0].connections[0].socketRemoteAddr, 'first peer connection');
    assert.equals(client1Name, peers[1].connections[0].socketRemoteAddr, 'first peer connection');
    server.quit(assert.end);
  });
});


test('remove peer: should remove requested peer', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    var peer = server.peers.add(clientName);
    server.peers.delete(clientName, peer.connect());
    assert.notOk(server.peers.get(clientName),
      'Added peer should have been deleted. Nothing should be returned');
    peer.close(function onClose() {
      server.quit(assert.end);
    });
  });
});


test('getOut connection: add and get for provided peer', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    var peer = server.peers.add(clientName);
    assert.ok(peer, 'added peer should be returned');
    var conn = peer.connect();
    assert.ok(conn, 'added connections should be returned');
    assert.equals(conn.socketRemoteAddr, clientName, 'Remote address should match the client');
    server.quit(assert.end);
  });
});


test('make socket: should throw for invalid destination', function t(assert) {
  var server = new TChannel();
  server.listen(serverOptions.port, serverOptions.host, function listening() {
    assert.throws(function () {
      server.peers.add('localhost').connect();
    }, /invalid destination/,
      'Should reject invalid destination');
    server.quit(assert.end);
  });
});
