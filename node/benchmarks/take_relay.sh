#!/bin/bash
set -e
set -x

rev=$(git rev-parse --short HEAD)
sym=$(git symbolic-ref HEAD)
sym=${sym##*/}

node benchmarks/index.js --relay -o benchmarks/relay-$rev.json -- --relay -m 5 -c 10 -p 1000,10000,20000 -s 4,$(( 2 ** 12 )),$(( 2 ** 14 ))
ln -sf relay-$rev.json benchmarks/relay-$sym.json
