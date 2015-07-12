module.exports = ScoredMaxHeap;

var util = require('util');

// A pre-computed score max heap with reference handles (index)
// TODO: evaluate many things, including:
// - is it worth it to store the scores in a typed array?
// - would be better off storing item and score in an array of records?

function ScoredMaxHeap() {
    this.items = [];
    this.scores = [];
}

ScoredMaxHeap.prototype.check = function check(assert) {
    for (var i = 1; i < this.scores.length; i++) {
        var par = Math.floor((i - 1) / 2);
        assert.ok(
            this.scores[par] > this.scores[i],
            util.format('score[%s] > score[%s] (%s > %s)',
                par, i,
                this.scores[par],
                this.scores[i]));
    }
};

ScoredMaxHeap.prototype.heapify = function heapify() {
    if (this.items.length <= 1) {
        return;
    }
    for (var i = Math.floor(this.items.length / 2 - 1); i >= 0; i--) {
        this.siftdown(i);
    }
};

ScoredMaxHeap.prototype.push = function push(item, score) {
    var i = this.items.length;
    this.items.push(item);
    this.scores.push(score);
    this.siftup(i);
    return i;
};

ScoredMaxHeap.prototype.remove = function remove(i) {
    if (i >= this.items.length) {
        return;
    }

    if (this.items.length === 1) {
        this.scores.pop();
        this.items.pop();
        return;
    }

    var j = this.items.length - 1;
    if (i === j) {
        this.scores.pop();
        this.items.pop();
        return;
    }

    this.swap(i, j);
    this.scores.pop();
    this.items.pop();
    this.siftup(i);
};

ScoredMaxHeap.prototype.pop = function pop() {
    var item = null;

    if (!this.items.length) {
        return item;
    }

    if (this.items.length === 1) {
        item = this.items.pop();
        this.scores.pop();
        return item;
    }

    item = this.items[0];
    this.items[0] = this.items.pop();
    this.scores[0] = this.scores.pop();
    this.siftdown(0);
    return item;
};

ScoredMaxHeap.prototype.siftdown = function siftdown(i) {
    while (i < this.scores.length) {
        var left = (2 * i) + 1;
        var right = left + 1;
        if (left < this.scores.length &&
            this.scores[left] > this.scores[i]) {
            if (right < this.scores.length &&
                this.scores[right] > this.scores[left]) {
                this.swap(i, right);
                i = right;
            } else {
                this.swap(i, left);
                i = left;
            }
        } else if (right < this.scores.length &&
                   this.scores[right] > this.scores[i]) {
            this.swap(i, right);
            i = right;
        } else {
            break;
        }
    }
};

ScoredMaxHeap.prototype.siftup = function siftup(i) {
    while (i > 0) {
        var par = Math.floor((i - 1) / 2);
        if (this.scores[i] > this.scores[par]) {
            this.swap(i, par);
            i = par;
        } else {
            break;
        }
    }
    this.siftdown(i);
};

ScoredMaxHeap.prototype.swap = function swap(i, j) {
    var tmpItem = this.items[i];
    this.items[i] = this.items[j];
    this.items[j] = tmpItem;

    var tmpScore = this.scores[i];
    this.scores[i] = this.scores[j];
    this.scores[j] = tmpScore;
};

// function heapifyTest(n) {
//     var assert = require('assert');
//     var base = 'a'.charCodeAt(0);

//     perms(n, function printPerm(perm) {
//         perm = perm.map(letterN);
//         var heap = new ScoredMaxHeap();
//         for (var i = 0; i < perm.length; i++) {
//             heap.items.push(perm[i]);
//             heap.scores.push(perm[i].charCodeAt(0));
//         }
//         heap.heapify();
//         heap.check(assert);
//     });

//     function letterN(n) {
//         return String.fromCharCode(base + n - 1);
//     }

//     function perms(n, each) {
//         if (n > 1) {
//             perms(n - 1, function eachSubPerm(perm) {
//                 perm.push(n);
//                 each(perm);
//                 var j = n - 1;
//                 for (var i = j--; i > 0; i = j--) {
//                     var tmp = perm[i];
//                     perm[i] = perm[j];
//                     perm[j] = tmp;
//                     each(perm);
//                 }
//                 perm.shift();
//             });
//         } else {
//             each([n]);
//         }
//     }
// }

// function permTest() {
//     var assert = require('assert');
//     var base = 'a'.charCodeAt(0);

//     perms(12, function printPerm(perm) {
//         perm = perm.map(letterN);
//         var heap = new ScoredMaxHeap();
//         for (var i = 0; i < perm.length; i++) {
//             heap.push(perm[i], perm[i].charCodeAt(0));
//         }
//         heap.check(assert);
//     });

//     function letterN(n) {
//         return String.fromCharCode(base + n - 1);
//     }

//     function perms(n, each) {
//         if (n > 1) {
//             perms(n - 1, function eachSubPerm(perm) {
//                 perm.push(n);
//                 each(perm);
//                 var j = n - 1;
//                 for (var i = j--; i > 0; i = j--) {
//                     var tmp = perm[i];
//                     perm[i] = perm[j];
//                     perm[j] = tmp;
//                     each(perm);
//                 }
//                 perm.shift();
//             });
//         } else {
//             each([n]);
//         }
//     }
// }

// function test() {
//     var assert = require('assert');

//     var heap = new ScoredMaxHeap();
//     // for (var i = 0x66; i >= 0x61; i--) {
//     for (var i = 0x61; i < 0x6e; i++) {
//     // for (var i = 0x61; i < 0x7b; i++) {
//     }
//     // for (var i = 0x41; i < 0x5b; i++) {
//     //     heap.push(String.fromCharCode(i), i);
//     // }

//     heap.check(assert);
//     console.log(heap.items);
//     console.log(heap.scores);

//     letter = letter.toUpperCase();

//     heap.check(assert);
//     console.log(heap.items);
//     console.log(heap.scores);
// }
