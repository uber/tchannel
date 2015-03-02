.PHONY: install test_ci test lint

DEV_BRANCH=dev_node
RELEASE_BRANCH=release_node

.DEFAULT_GOAL := test

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
