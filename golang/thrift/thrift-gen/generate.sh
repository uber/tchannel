#!/bin/sh
# Helper script to invoke Apache Thrift's compiler and thrift-gen for a given Thrift file.

THRIFTFILE="$1"
if [ -z "$THRIFTFILE" ]; then
  echo "Please specify Thrift file to generate a service for."
  exit -1
fi
if [ ! -f "$THRIFTFILE" ]; then
  echo "Please specify a valid Thrift file to generate a service for."
  exit -1
fi

THRIFTNAME=`basename "${THRIFTFILE}"`
THRIFTNAME="${THRIFTNAME%%.*}"
THRIFTDIR=`dirname "$THRIFTFILE"`
THRIFT_GENDIR="${THRIFTDIR}/gen-go/"

echo "Generate code for $THRIFTNAME in $THRIFT_GENDIR"

# Delete any existing generated code.
rm -rf "$THRIFT_GENDIR"
mkdir "$THRIFT_GENDIR"

# Generate the thrift serialization/deserialization library using Apache Thrift.
thrift -r --gen go:thrift_import=github.com/apache/thrift/lib/go/thrift -o "$THRIFTDIR/" "$THRIFTFILE"

# Delete any -remote folders generated.
rm -rf "$THRIFT_GENDIR/$THRIFTNAME/"*-remote

# Generate the TChannel client
FILES=`ls *.go | grep -v _test.go`
go run $FILES --inputFile "$THRIFTFILE" --outputFile "$THRIFT_GENDIR/$THRIFTNAME/tchan-$THRIFTNAME.go"
