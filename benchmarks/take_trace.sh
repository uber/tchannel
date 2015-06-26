#!/bin/bash
set -e
set -x

rev=$(git rev-parse --short HEAD)
sym=$(git symbolic-ref HEAD)
sym=${sym##*/}

# Cannot take --trace flag to multi_bench due to timeout+OOM.
# Cannot take 20k concurrency as it totally falls over
#node benchmarks/index.js --relay --trace -o benchmarks/trace-$rev.json -- --relay --trace -m 5 -c 10 -p 1000,10000,20000 -s 4,$(( 2 ** 12 )),$(( 2 ** 14 ))
node benchmarks/index.js --relay --trace -o benchmarks/trace-$rev.json -- --relay -m 5 -c 10 -p 1000,10000 -s 4,$(( 2 ** 12 )),$(( 2 ** 14 ))
ln -sf trace-$rev.json benchmarks/trace-$sym.json
