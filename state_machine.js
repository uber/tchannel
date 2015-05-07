'use strict';

// Peer and Circuit are state machines.

module.exports = StateMachine;

function StateMachine() {
    var self = this;
    self.state = null;
}

StateMachine.prototype.setState = function setState(StateType) {
    var self = this;
    var currentType = self.state && self.state.type;
    if (currentType &&
        StateType.prototype.type &&
        StateType.prototype.type === currentType) {
        return;
    }
    var state = new StateType(self.stateOptions);
    if (state && state.type === currentType) {
        return;
    }
    var oldState = self.state;
    self.state = state;
    self.stateChangedEvent.emit(self, [oldState, state]);
}
