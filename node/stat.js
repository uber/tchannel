'use strict';

var Stat = {
    Counter: Counter,
    Timer: Timer
};

module.exports = Stat;

function Counter(name, value, tags) {
    var self = this;

    self.type = 'counter';
    self.name = name;
    self.value = value;
    self.tags = tags;
}

function Timer(name, value, tags) {
    var self = this;

    self.type = 'timer';
    self.name = name;
    self.value = value;
    self.tags = tags;
}
