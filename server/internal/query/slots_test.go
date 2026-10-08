package query

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestReportsQueueWhenAllSlotsAreTaken(t *testing.T) {
	for range concurrentReports {
		if err := acquireReport(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	defer func() {
		for range concurrentReports {
			releaseReport()
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := acquireReport(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("a fifth report should wait for a slot and give up at its deadline, got %v", err)
	}
	releaseReport()
	if err := acquireReport(context.Background()); err != nil {
		t.Fatalf("a freed slot should be taken: %v", err)
	}
}

func TestExportMayAskForMoreRowsThanTheDashboard(t *testing.T) {
	if maxRows(false) != 100 || maxRows(true) != ExportMaxRows || ExportMaxRows < 1000 {
		t.Fatalf("limits: %d %d", maxRows(false), maxRows(true))
	}
}
