#!/usr/bin/env bash
set -e

# A utility script to make repro output from the streaming_bisect test more
# readily diff-able.
#
# Example:
#
# $ NODE_DEBUG=tchannel,tchannel_dump node test/streaming_bisect.js \
#     --repro --head '31KiB + 965B' --body '64KiB' --timeout 1000 2>&1 | tee good
#
# $ NODE_DEBUG=tchannel,tchannel_dump node test/streaming_bisect.js \
#     --repro --head '31KiB + 966B' --body 64KiB --timeout 1000 2>&1 | tee bad
#
# $ diff -u \
#     <(./test/streaming_bisect_relabel.sh good) \
#     <(./test/streaming_bisect_relabel.sh bad)

if [ $# -eq 0 ]; then
    res=$(mktemp)
    cat >$res
else
    res=$1
fi

# find the '# cluster host N: HOST:PORT' comments and use them to transform all
# matching "HOST:PORT"s into "hostN:SERVER"s
#
# also find the (single!) test pid and replace it with "TESTPID"
sed_args=$(
    <$res grep '# cluster host' | grep -o '[0-9]:.*' |
    while read numColon host_port; do
        name=host${numColon%*:}:SERVER
        echo "-e s/$host_port/$name/"
    done

    test_pid=$(
        <$res egrep -om1 'TCHANNEL [0-9]+:' | egrep -o '[0-9]+'
    )
    echo "-e s/\\<$test_pid\\>/TESTPID/"
)
out=$(mktemp)
<$res sed $sed_args >$out
res=$out

# find all lines like:
#     "debug: incoming server connection ~ { hostPort: 'hostN:SERVER', remoteAddr: '127.0.0.1:12345' }"
# then transform all matching "HOST:PORT"s from the found remoteAddrs into "hostN:CLIENT"s
sed_args=$(
    <$res grep 'debug: incoming server connection' |
    cut -d~ -f2- |
    tr -d "{',}" | {
        declare -A counts
        while read hp host_port ra remote_addr; do
            if [ "$hp" == 'hostPort:' ] && [ "$ra" == 'remoteAddr:' ]; then
                host_port=${host_port%*SERVER}
                count=${counts[$host_port]}
                count=$(( ${count:=0} + 1 ))
                counts[$host_port]=$count
                echo "-e s/$remote_addr/${host_port}CLIENT$count/"
            fi
        done
    }
)
<$res sed $sed_args
