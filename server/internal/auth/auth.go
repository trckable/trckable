// Package auth holds trckable's credential primitives: argon2id passwords,
// random tokens, and their hashes. Tokens (session cookies, API keys, the
// setup token) are only ever stored as SHA-256 hashes.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"golang.org/x/crypto/argon2"
)

// OWASP 2024+ minimum for argon2id: m=19 MiB, t=2, p=1. Light on RAM, which
// matters for a 64 MB server, and still expensive to brute force.
const (
	argonMem     = 19 * 1024
	argonTime    = 2
	argonThreads = 1
	argonKeyLen  = 32
)

// MinPasswordLen is enforced at setup and password change.
const MinPasswordLen = 10

var ErrWeakPassword = fmt.Errorf("use at least %d characters; a few unrelated words work well", MinPasswordLen)

// HashPassword returns a self-describing argon2id hash. For commands; the
// server uses HashPasswordCtx, which gives up when the queue is too long.
func HashPassword(pw string) (string, error) {
	return HashPasswordCtx(context.Background(), pw)
}

// HashPasswordCtx is HashPassword that waits for a hashing slot at most
// HashWait, or until ctx ends, and then answers ErrBusy.
func HashPasswordCtx(ctx context.Context, pw string) (string, error) {
	if len(pw) < MinPasswordLen {
		return "", ErrWeakPassword
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := argonKey(ctx, []byte(pw), salt, argonTime, argonMem, argonThreads, argonKeyLen)
	if err != nil {
		return "", err
	}
	b := base64.RawStdEncoding
	return fmt.Sprintf("argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", argonMem, argonTime, argonThreads, b.EncodeToString(salt), b.EncodeToString(key)), nil
}

// VerifyPassword checks pw against a hash from HashPassword in constant time.
// A busy server counts as a mismatch; the server uses VerifyPasswordCtx.
func VerifyPassword(hash, pw string) bool {
	ok, _ := VerifyPasswordCtx(context.Background(), hash, pw)
	return ok
}

// VerifyPasswordCtx is VerifyPassword that answers ErrBusy instead of
// waiting longer than HashWait (or past ctx) for a hashing slot.
func VerifyPasswordCtx(ctx context.Context, hash, pw string) (bool, error) {
	parts := strings.Split(hash, "$")
	if len(parts) != 5 || parts[0] != "argon2id" {
		return false, nil
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[2], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false, nil
	}
	// Reject malformed or hostile parameters before hashing: an empty key
	// panics inside argon2, and a huge m would exhaust memory.
	if m < 8*1024 || m > 256*1024 || t < 1 || t > 10 || p < 1 || p > 8 {
		return false, nil
	}
	b := base64.RawStdEncoding
	salt, err1 := b.DecodeString(parts[3])
	want, err2 := b.DecodeString(parts[4])
	if err1 != nil || err2 != nil || len(salt) < 8 || len(want) < 16 || len(want) > 64 {
		return false, nil
	}
	got, err := argonKey(ctx, []byte(pw), salt, t, m, p, uint32(len(want))) //nolint:gosec // len(want) is at most 64, checked above
	if err != nil {
		return false, err
	}
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

// MaxConcurrentHashes is how many argon2 hashes run at once. Each takes its
// memory parameter (19 MB) for as long as it runs, and every sign-in, setup,
// share password and password check makes one: ten sign-ins arriving
// together took a server from 23 MB to 229 MB. The rest wait their turn,
// which costs them milliseconds and the server nothing.
const MaxConcurrentHashes = 2

var (
	hashing = make(chan struct{}, MaxConcurrentHashes)
	running atomic.Int32
	peak    atomic.Int32 // the most that ran at once, for the test
)

// HashWait is the longest a password check waits for a slot. A flood of
// sign-ins must not make everyone else's wait until the server's write
// timeout: past this they are told to try again in a moment (503).
var HashWait = 5 * time.Second

// ErrBusy: every hashing slot stayed taken for HashWait.
var ErrBusy = errors.New("the server is busy checking passwords: try again in a few seconds")

func argonKey(ctx context.Context, pw, salt []byte, t, m uint32, p uint8, n uint32) ([]byte, error) {
	timer := time.NewTimer(HashWait)
	defer timer.Stop()
	select {
	case hashing <- struct{}{}:
	case <-ctx.Done():
		return nil, ErrBusy
	case <-timer.C:
		return nil, ErrBusy
	}
	defer func() { <-hashing }()
	now := running.Add(1)
	defer running.Add(-1)
	for {
		old := peak.Load()
		if now <= old || peak.CompareAndSwap(old, now) {
			break
		}
	}
	return argon2.IDKey(pw, salt, t, m, p, n), nil
}

var b32 = base32.NewEncoding("abcdefghijklmnopqrstuvwxyz234567").WithPadding(base32.NoPadding)

// Token returns prefix + n random bytes in lowercase base32.
func Token(prefix string, n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return prefix + b32.EncodeToString(b)
}

// Hash is the stored form of a token.
func Hash(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

// Equal compares secrets in constant time.
func Equal(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// Errors returned by the account store.
var (
	ErrNotFound   = errors.New("not found")
	ErrExists     = errors.New("already exists")
	ErrBadLogin   = errors.New("wrong email or password; check them and try again")
	ErrSetupDone  = errors.New("setup already completed")
	ErrSetupToken = errors.New("that setup token isn’t right; copy it again from the server log")
)

// HoldHashSlots takes every hashing slot until release is called, so tests
// of a server can see how it answers a flood. Not for anything else.
func HoldHashSlots() (release func()) {
	for i := 0; i < MaxConcurrentHashes; i++ {
		hashing <- struct{}{}
	}
	return func() {
		for i := 0; i < MaxConcurrentHashes; i++ {
			<-hashing
		}
	}
}
