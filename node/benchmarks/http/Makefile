run-raw-http:
	node index.js --keepAlive

torch-ingress-nonstreamed:
	node index.js --relay --keepAlive --torch relay --torchIndex 0 --torchFile ./flame.raw --torchTime 10

torch-egress-nonstreamed:
	node index.js --relay --keepAlive --torch relay --torchIndex 1 --torchFile ./flame.raw --torchTime 10

torch-ingress-streamed:
	node index.js --relay --ingressStreamed --keepAlive --torch relay --torchIndex 0 --torchFile ./flame.raw --torchTime 10

torch-egress-streamed:
	node index.js --relay --egressStreamed --keepAlive --torch relay --torchIndex 1 --torchFile ./flame.raw --torchTime 10

create-flame:
	stackcollapse-stap.pl ./flame.raw | tr -d "\0" > ./flame.folded
	flamegraph.pl ./flame.folded > ./flame.svg
	google-chrome ./flame.svg
