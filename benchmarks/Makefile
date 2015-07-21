torch-client-bench:
	node index.js --relay --torch client --torchFile ./flame.raw --torchTime 10 \
		-- --relay --skipPing -s 4096,16384 -p 1000,10000,20000

torch-server-bench:
	node index.js --relay --torch server --torchFile ./flame.raw --torchTime 10 \
		-- --relay --skipPing -s 4096,16384 -p 1000,10000,20000

torch-relay-bench:
	node index.js --relay --torch relay --torchFile ./flame.raw --torchTime 10 \
		-- --relay --skipPing -s 4096,16384 -p 1000,10000,20000

flame-torch-relay-bench:
	node index.js --relay --torch relay --torchFile ./flame.html --torchTime 10 --torchType flame \
		-- --relay --skipPing -s 4096,16384 -p 1000,10000,20000

# torch-trace-bench:
# 	node index.js --trace --relay --torch server --torchFile ./flame.raw \
# 		-- --skipPing -s 4096

create-flame:
	stackcollapse-stap.pl ./flame.raw | tr -d "\0" > ./flame.folded
	flamegraph.pl ./flame.folded > ./flame.svg
	google-chrome ./flame.svg

kill-dead-benchmarks:
	ps aux | pkill -f nodejs-benchmarks;

top-benchmark:
	top -d1 -cp `pgrep -f nodejs-benchmarks | tr "\\n" "," | sed 's/,$$//'`;

take:
	node index.js -o $$(git rev-parse --short HEAD).json -- \
		-m 5 -s 4,4096,16384 -p 1000,10000,20000
	ln -sf $$(git rev-parse --short HEAD).json $$(basename $$(git symbolic-ref HEAD)).json

take_relay:
	node index.js --relay -o relay-$$(git rev-parse --short HEAD).json \
		-- --relay --skipPing -m 3 -s 4096,16384 -p 1000,10000,20000
	ln -sf relay-$$(git rev-parse --short HEAD).json relay-$$(basename $$(git symbolic-ref HEAD)).json

take_trace:
	# Cannot take --trace flag to multi_bench due to timeout+OOM.
	# Cannot take 20k concurrency as it totally falls over
	node index.js --relay --trace -o trace-$$(git rev-parse --short HEAD).json \
		-- --relay -m 5 -c 10 -s 4096,16384 -p 1000,10000
	ln -sf trace-$$(git rev-parse --short HEAD).json trace-$$(basename $$(git symbolic-ref HEAD)).json

.PHONY: kill-dead-benchmarks top-benchmark take take_relay take_trace
