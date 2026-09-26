package server

import (
	"context"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/backup"
)

// The last off-site copy is kept in the control database: after a restart
// Health still knows it, and a status for another bucket is not reused.
func TestOffsiteStatusSurvivesARestart(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	ctl := openCtl(t, dir)
	defer ctl.Close()
	r, _ := backup.ParseRemote("https://key:secret@s3.example.com/bucket/trckable")
	s := &Server{ctl: ctl, remote: r}
	s.setOffsite(ctx, &offsiteStatus{at: 1_790_000_000})

	again := &Server{ctl: ctl, remote: r}
	again.loadOffsite(ctx)
	if st := again.offsite.Load(); st == nil || st.at != 1_790_000_000 || st.err != "" {
		t.Fatalf("after a restart: %+v", st)
	}
	s.setOffsite(ctx, &offsiteStatus{at: 1_790_000_000, err: "timeout"})
	again.loadOffsite(ctx)
	if st := again.offsite.Load(); st.err != "timeout" || st.at != 1_790_000_000 {
		t.Fatalf("a failure after a copy: %+v", st)
	}

	moved, _ := backup.ParseRemote("https://key:secret@s3.example.com/another")
	elsewhere := &Server{ctl: ctl, remote: moved}
	elsewhere.loadOffsite(ctx)
	if st := elsewhere.offsite.Load(); st != nil {
		t.Fatalf("another bucket inherited the status: %+v", st)
	}
	raw, _, _ := ctl.Meta(ctx, offsiteKey)
	if raw == "" || strings.Contains(raw, "secret") {
		t.Fatalf("kept status: %q", raw)
	}
}
