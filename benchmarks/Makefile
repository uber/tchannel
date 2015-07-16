top-benchmark:
	top -d1 -cp `pgrep -f nodejs-benchmarks | tr "\\n" "," | sed 's/,$$//'`

create-flame:
	stackcollapse-stap.pl ./flame.raw > ./flame.folded
	flamegraph.pl ./flame.folded > ./flame.svg
	google-chrome ./flame.svg

.PHONY: top-benchmark create-flame
