#!/usr/bin/env bash
set -e
# set -x

FILES=$(
    ls --color=never test/**/*.js test/*.js | \
    sed "s/test\//.\//g" | \
    grep -v 'lib' | \
    grep -v './index.js'
)

# echo $FILES

for FILE in $FILES; do
    # echo $FILE

    set +e
    WORD=$(git grep "require('$FILE')" | grep 'test/index')
    EXIT_CODE="$?"
    set -e

    if [ "$EXIT_CODE" != "0" ]; then
        echo "Could not find $FILE";
        exit 1
    fi
done

echo "All tests included!"
