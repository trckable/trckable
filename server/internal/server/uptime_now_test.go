package server

import (
	"testing"
	"time"
)

func TestRecheckGateLetsOneLookThroughInFiveMinutes(t *testing.T) {
	var g recheckGate
	at := time.Unix(1_800_000_000, 0)
	if !g.allow("a", at) {
		t.Fatal("the first look was held back")
	}
	if g.allow("a", at.Add(4*time.Minute)) {
		t.Fatal("a second look inside five minutes")
	}
	if !g.allow("b", at.Add(time.Minute)) {
		t.Fatal("another site was held back")
	}
	if !g.allow("a", at.Add(5*time.Minute)) {
		t.Fatal("no look after five minutes")
	}
}
