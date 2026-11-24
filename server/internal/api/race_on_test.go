//go:build race

package api

// raceEnabled is true when the tests run under the race detector, which draws pictures several times slower.
const raceEnabled = true
