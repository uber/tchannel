DEV_BRANCH=dev_hyperbahn

# Helper for running autobahn servers locally.
run-local-%:
	node server.js --port `expr 21300 + $*` --bootstrapFile='["127.0.0.1:21300","127.0.0.1:21301"]' | jq .

update_dev:
    # git-subtree is sensitive to user git-config settings...
    cd ..  && HOME= XDG_CONFIG_HOME= git subtree push --prefix=hyperbahn . ${DEV_BRANCH}

