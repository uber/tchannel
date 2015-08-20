
# Helper for running autobahn servers locally.
run-local-%:
	node server.js --port `expr 21300 + $*` --bootstrapFile='["127.0.0.1:21300","127.0.0.1:21301"]' | jq .
