#!/bin/bash
set -e
set -x

rev=$(git rev-parse --short HEAD)
sym=$(git symbolic-ref HEAD)
sym=${sym##*/}

node benchmarks/index.js -o benchmarks/$rev.json -- -m 5 -p 1000,10000,20000 -s 4,$(( 2 ** 12 )),$(( 2 ** 14 ))
ln -sf $rev.json benchmarks/$sym.json
