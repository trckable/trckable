// Package auth holds trckable's credential primitives: argon2id passwords,
// random tokens, and their hashes. Tokens (session cookies, API keys, the
// setup token) are only ever stored as SHA-256 hashes.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

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

var ErrWeakPassword = fmt.Errorf("password must be at least %d characters", MinPasswordLen)

// HashPassword returns a self-describing argon2id hash.
func HashPassword(pw string) (string, error) {
	if len(pw) < MinPasswordLen {
		return "", ErrWeakPassword
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(pw), salt, argonTime, argonMem, argonThreads, argonKeyLen)
	b := base64.RawStdEncoding
	return fmt.Sprintf("argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", argonMem, argonTime, argonThreads, b.EncodeToString(salt), b.EncodeToString(key)), nil
}

// VerifyPassword checks pw against a hash from HashPassword in constant time.
func VerifyPassword(hash, pw string) bool {
	parts := strings.Split(hash, "$")
	if len(parts) != 5 || parts[0] != "argon2id" {
		return false
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[2], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	// Reject malformed or hostile parameters before hashing: an empty key
	// panics inside argon2, and a huge m would exhaust memory.
	if m < 8*1024 || m > 256*1024 || t < 1 || t > 10 || p < 1 || p > 8 {
		return false
	}
	b := base64.RawStdEncoding
	salt, err1 := b.DecodeString(parts[3])
	want, err2 := b.DecodeString(parts[4])
	if err1 != nil || err2 != nil || len(salt) < 8 || len(want) < 16 || len(want) > 64 {
		return false
	}
	got := argon2.IDKey([]byte(pw), salt, t, m, p, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
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
	ErrBadLogin   = errors.New("wrong email or password")
	ErrSetupDone  = errors.New("setup already completed")
	ErrSetupToken = errors.New("invalid setup token")
)
