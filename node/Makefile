.PHONY: install test_ci test lint

DEV_BRANCH=dev_node
RELEASE_BRANCH=release_node

.DEFAULT_GOAL := test

TEST_HOST=127.0.0.1
TEST_PORT=0
TEST_LOG_FILE=test-server.log

test_server:
	node test/lib/run_server.js --logFile ${TEST_LOG_FILE} --host ${TEST_HOST} --port ${TEST_PORT}

install:
	npm install

test_ci: test

test:
	npm test

lint:
	npm run lint

update_dev:
	# git-subtree is sensitive to user git-config settings...
	cd ..  && HOME= XDG_CONFIG_HOME= git subtree push --prefix=node . ${DEV_BRANCH}

update_release:
	# git-subtree is sensitive to user git-config settings...
	cd .. && HOME= XDG_CONFIG_HOME= git subtree push --prefix=node . ${RELEASE_BRANCH}
