'use strict';

var Stat = {
    Counter: Counter
};

module.exports = Stat;

function Counter(name, value, tags) {
    var self = this;

    self.type = 'counter';
    self.name = name;
    self.value = value;
    self.tags = tags;
}
