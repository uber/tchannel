# How to read comparison output

The comparison script runs the benchmark suite against two different git
branches and reports stats on the difference in message rate.

The reported stat is the difference of the "hi" B value and the "hi" A value.
So since we're talking about message rates where higher is better, a negative
value is a slow down and a positive value is a speedup.  The "hi" value of the
A/B sample is the standard "flier" point on a boxplot (that is, the highest
value less-than-or-equal-to `Q3 + 3/2*(Q3 - Q1)` where Q1 and Q3 are the
25%-ile and 75%-ile).

Note the 5x multiplicity of test runs is just barely enough to provide a
sufficiently sized sample.

```bash
$ ./benchmarks/compare_to.sh -m 5 master
+ multiplicity=2
+ getopts m: OPT
+ case $OPT in
+ multiplicity=5
+ getopts m: OPT
+ shift 2
+ base_branch=master
+ shift
+++ readlink -f ./benchmarks/compare_to.sh
++ dirname .../benchmarks/compare_to.sh
+ bench_dir=.../benchmarks
+++ git symbolic-ref HEAD
++ basename refs/heads/dev
+ cur_branch=dev
+ for branch in '$base_branch' '$cur_branch'
+ git checkout master
Switched to branch 'master'
Your branch and 'origin/master' have diverged,
and have 4 and 2 different commits each, respectively.
+ node .../benchmarks/index.js -m 5 -o benchmarks/master.json
         PING,     1/5 min/max/avg/p95:    0/   6/   0.07/   1.00   1406ms total, 14224.75 ops/sec
...
+ for branch in '$base_branch' '$cur_branch'
+ git checkout dev
Switched to branch 'dev'
Your branch and 'origin/dev' have diverged,
and have 20 and 13 different commits each, respectively.
+ node .../benchmarks/index.js -m 5 -o benchmarks/dev.json
         PING,     1/5 min/max/avg/p95:    0/   6/   0.07/   1.00   1414ms total, 14144.27 ops/sec
...
+ node .../benchmarks/compare.js .../benchmarks/such_bench.json .../benchmarks/wat_ident.json
GET large str, 1/5     rate: hi-diff:     38.27 (  0.3%)
GET large str, 200/5   rate: hi-diff:   -823.92 ( -2.4%)
GET large str, 20000/5 rate: hi-diff:   -331.19 ( -0.9%)
GET large str, 50/5    rate: hi-diff:   -368.36 ( -1.1%)
GET small str, 1/5     rate: hi-diff:    -78.97 ( -0.5%)
GET small str, 200/5   rate: hi-diff:   1263.28 (  2.4%)
GET small str, 20000/5 rate: hi-diff:   1036.05 (  2.1%)
GET small str, 50/5    rate: hi-diff:    793.06 (  1.6%)
PING, 1/5              rate: hi-diff:   -292.08 ( -1.9%)
PING, 200/5            rate: hi-diff:   -617.30 ( -1.1%)
PING, 20000/5          rate: hi-diff:   1095.51 (  2.0%)
PING, 50/5             rate: hi-diff:    141.84 (  0.3%)
SET large buf, 1/5     rate: hi-diff:    122.13 (  1.0%)
SET large buf, 200/5   rate: hi-diff:   1134.64 (  3.5%)
SET large buf, 20000/5 rate: hi-diff:   -263.80 ( -1.0%)
SET large buf, 50/5    rate: hi-diff:    799.79 (  2.5%)
SET large str, 1/5     rate: hi-diff:    155.50 (  1.3%)
SET large str, 200/5   rate: hi-diff:    499.20 (  1.5%)
SET large str, 20000/5 rate: hi-diff:   1175.22 (  4.4%)
SET large str, 50/5    rate: hi-diff:    484.56 (  1.5%)
SET small buf, 1/5     rate: hi-diff:    171.00 (  1.2%)
SET small buf, 200/5   rate: hi-diff:   -777.00 ( -1.5%)
SET small buf, 20000/5 rate: hi-diff:  -1195.77 ( -2.4%)
SET small buf, 50/5    rate: hi-diff:    951.90 (  2.0%)
SET small str, 1/5     rate: hi-diff:   -324.90 ( -2.2%)
SET small str, 200/5   rate: hi-diff:   -517.98 ( -1.0%)
SET small str, 20000/5 rate: hi-diff:   -620.36 ( -1.2%)
SET small str, 50/5    rate: hi-diff:      0.00 (  0.0%)
```
