kill-dead-benchmarks:
	ps aux | grep nodejs-benchmarks | awk '{ print $$2; }' | xargs kill;

top-benchmark:
	top -cp `ps aux | grep nodejs-benchmarks | grep -v grep | awk '{ print $$2; }' | tr "\\n" "," | sed 's/,$$//'`;

