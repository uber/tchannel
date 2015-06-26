kill-dead-benchmarks:
	ps aux | pkill -f nodejs-benchmarks;

top-benchmark:
	top -cp `pgrep -f nodejs-benchmarks | tr "\\n" "," | sed 's/,$$//'`;

.PHONY: kill-dead-benchmarks top-benchmark
