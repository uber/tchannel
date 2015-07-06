package tchannel

import (
	"fmt"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

type statsValue struct {
	count int
}

type recordingStatsReporter struct {
	// Counters is a map from the counterName -> map[tagMapAsString]*statsValue
	Counters map[string]map[string]*statsValue

	// Expected stores expected counter values.
	Expected *recordingStatsReporter
}

func newRecordingStatsReporter() *recordingStatsReporter {
	return &recordingStatsReporter{
		Counters: make(map[string]map[string]*statsValue),
		Expected: &recordingStatsReporter{
			Counters: make(map[string]map[string]*statsValue),
		},
	}
}

// keysMap returns the keys of the given map as a sorted list of strings.
// If the map is not of the type map[string]* then the function will panic.
func keysMap(m interface{}) []string {
	var keys []string
	mapKeys := reflect.ValueOf(m).MapKeys()
	for _, v := range mapKeys {
		keys = append(keys, v.Interface().(string))
	}
	sort.Strings(keys)
	return keys
}

// tagsToString converts a map of tags to a string that can be used as a map key.
func tagsToString(tags map[string]string) string {
	var vals []string
	for _, k := range keysMap(tags) {
		vals = append(vals, fmt.Sprintf("%v = %v", k, tags[k]))
	}
	return strings.Join(vals, ", ")
}

func (r *recordingStatsReporter) IncCounter(name string, tags map[string]string, value int) {
	tagMap, ok := r.Counters[name]
	if !ok {
		tagMap = make(map[string]*statsValue)
		r.Counters[name] = tagMap
	}

	tagStr := tagsToString(tags)
	statVal, ok := tagMap[tagStr]
	if !ok {
		statVal = &statsValue{}
		tagMap[tagStr] = statVal
	}

	statVal.count += value
}

func (r *recordingStatsReporter) ValidateCounters(t *testing.T) {
	assert.Equal(t, keysMap(r.Expected.Counters), keysMap(r.Counters),
		"Counters have different keys")
	for counterKey, counter := range r.Counters {
		expectedCounter, ok := r.Expected.Counters[counterKey]
		if !ok {
			continue
		}

		assert.Equal(t, keysMap(expectedCounter), keysMap(counter),
			"Counter %v have different reported tags", counterKey)
		for tags, stat := range counter {
			expectedStat, ok := expectedCounter[tags]
			if !ok {
				continue
			}

			assert.Equal(t, expectedStat.count, stat.count,
				"counter %v with tags %v has mismatched value", counterKey, tags)
		}
	}
}

func (r *recordingStatsReporter) UpdateGauge(name string, tags map[string]string, value int)       {}
func (r *recordingStatsReporter) RecordTimer(name string, tags map[string]string, d time.Duration) {}
