torch-relay-bench:
	node index.js --relay --torch relay --torchFile ./flame.raw --torchTime 10 \
		-- --relay --skipPing -s 4096,16384 -p 1000,10000,20000

take_relay:
	node index.js --relay --noEndpointOverhead -o relay-$$(git rev-parse --short HEAD).json \
		-- --relay --skipPing -m 3 -s 4096,16384 -p 1000,10000,20000
	ln -sf relay-$$(git rev-parse --short HEAD).json relay-$$(basename $$(git symbolic-ref HEAD)).json

kill-dead-benchmarks:
	pkill -f nodejs-benchmarks;

top-benchmark:
	top -d1 -cp `pgrep -f nodejs-benchmarks | tr "\\n" "," | sed 's/,$$//'`;

create-flame:
	stackcollapse-stap.pl ./flame.raw | tr -d "\0" > ./flame.folded
	flamegraph.pl ./flame.folded > ./flame.svg
	google-chrome ./flame.svg

.PHONY: take_relay
