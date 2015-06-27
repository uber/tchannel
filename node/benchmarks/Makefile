torch-bench:
	node index.js --torch client --torchFile ./flame.raw

torch-relay-bench:
	node index.js --torch relay --torchFile ./flame.raw

create-flame:
	stackcollapse-stap.pl ./flame.raw > ./flame.folded
	flamegraph.pl ./flame.folder > ./flame.svg
	opn ./flame.svg

kill-dead-benchmarks:
	ps aux | pkill -f nodejs-benchmarks;

top-benchmark:
	top -cp `pgrep -f nodejs-benchmarks | tr "\\n" "," | sed 's/,$$//'`;

.PHONY: kill-dead-benchmarks top-benchmark
