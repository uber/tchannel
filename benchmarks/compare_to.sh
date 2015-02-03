#!/bin/bash
set -e
set -x

multiplicity=2

while getopts m: OPT; do
    case $OPT in
        m)
        multiplicity=$OPTARG
        ;;
    esac
done
shift $((OPTIND-1))

base_branch=${1:master}
shift

bench_dir=$(dirname $(readlink -f $0))
cur_branch=$(basename $(git symbolic-ref HEAD))

for branch in $base_branch $cur_branch; do
    git checkout $branch
    node $bench_dir/index.js -m $multiplicity -o benchmarks/$branch.json
done

node $bench_dir/compare.js $bench_dir/$base_branch.json $bench_dir/$cur_branch.json
