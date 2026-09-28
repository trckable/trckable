package auth

import (
	"context"
	"sync"
	"testing"
	"time"
)

// Each password hash takes argon2's 19 MB. Sign-ins arriving together (ten
// at once from one address are within the limit; more from many) must not
// each take that at the same time: a small server would run out of memory.
// Hashes wait their turn instead, a few at a time.
func TestPasswordHashesTakeTurns(t *testing.T) {
	hash, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	peak.Store(0)
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			pw := "correct horse battery"
			if i%2 == 1 {
				pw = "wrong horse battery"
			}
			if got := VerifyPassword(hash, pw); got != (i%2 == 0) {
				t.Errorf("verify %d: %v", i, got)
			}
		}(i)
	}
	wg.Wait()
	if p := peak.Load(); p > MaxConcurrentHashes {
		t.Fatalf("%d hashes ran at once, want at most %d", p, MaxConcurrentHashes)
	}
}

// A flood must not hold everyone for the server's write timeout: past
// HashWait a check gives up with ErrBusy, and a cancelled request at once.
func TestPasswordChecksGiveUpWhenTheQueueIsFull(t *testing.T) {
	hash, _ := HashPassword("correct horse battery")
	for i := 0; i < MaxConcurrentHashes; i++ {
		hashing <- struct{}{} // every slot taken
	}
	defer func() {
		for i := 0; i < MaxConcurrentHashes; i++ {
			<-hashing
		}
	}()
	old := HashWait
	HashWait = 50 * time.Millisecond
	defer func() { HashWait = old }()
	start := time.Now()
	if _, err := VerifyPasswordCtx(context.Background(), hash, "correct horse battery"); err != ErrBusy {
		t.Fatalf("full queue: %v, want ErrBusy", err)
	}
	if time.Since(start) > time.Second {
		t.Fatal("waited far past HashWait")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := HashPasswordCtx(ctx, "correct horse battery"); err != ErrBusy {
		t.Fatalf("cancelled: %v", err)
	}
}
