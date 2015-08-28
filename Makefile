.PHONY: install test_ci test lint update_dev

DEV_BRANCH=dev_hyperbahn

# Helper for running autobahn servers locally.
run-local-%:
	node server.js --port `expr 21300 + $*` --bootstrapFile='["127.0.0.1:21300","127.0.0.1:21301"]' | jq .

update_dev:
	# git-subtree is sensitive to user git-config settings...
	cd ..  && HOME= XDG_CONFIG_HOME= git subtree push --prefix=hyperbahn . ${DEV_BRANCH}

install:
	sudo apt-get install libpcap-dev
	rm -rf node_modules
	mkdir -p node_modules
	ln -s $$(readlink -f ../node) node_modules/tchannel
	(cd node_modules/tchannel; npm install)
	npm install
	npm ls || true

test_ci: test

test:
	npm run test-ci

lint:
	npm run lint
