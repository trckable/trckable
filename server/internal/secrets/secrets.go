// Package secrets encrypts values trckable must store but never expose:
// payment provider API keys and webhook signing secrets (AES-256-GCM).
//
// The key comes from TRCKABLE_SECRET (the Railway template generates one) or,
// if unset, from <data>/secret.key, created once with 0600 permissions. A key
// check value in the database detects a changed or lost key at boot, so
// trckable refuses to decrypt garbage instead of silently failing webhooks.
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ErrWrongKey means the configured secret is not the one the data was
// encrypted with (TRCKABLE_SECRET changed, or secret.key was lost).
var ErrWrongKey = errors.New("TRCKABLE_SECRET does not match the key this data was encrypted with")

// Box seals and opens values.
type Box struct {
	aead cipher.AEAD
	key  []byte
	kcv  string
}

// Load returns the Box for this instance.
func Load(dataDir, env string) (*Box, error) {
	var material []byte
	if env = strings.TrimSpace(env); env != "" {
		if len(env) < 16 {
			return nil, errors.New("TRCKABLE_SECRET must be at least 16 characters")
		}
		material = []byte(env)
	} else {
		path := filepath.Join(dataDir, "secret.key")
		b, err := os.ReadFile(path)
		switch {
		case err == nil:
			material = []byte(strings.TrimSpace(string(b)))
		case errors.Is(err, os.ErrNotExist):
			raw := make([]byte, 32)
			if _, err := rand.Read(raw); err != nil {
				return nil, err
			}
			material = []byte(hex.EncodeToString(raw))
			if err := os.WriteFile(path, append(material, '\n'), 0o600); err != nil {
				return nil, fmt.Errorf("create %s: %w", path, err)
			}
		default:
			return nil, err
		}
	}
	return New(material)
}

// New derives the encryption key from secret material.
func New(material []byte) (*Box, error) {
	// A key label, not a name: changing it would make every stored secret
	// unreadable.
	mac := hmac.New(sha256.New, []byte("trckable secrets v1"))
	mac.Write(material)
	key := mac.Sum(nil)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	check := hmac.New(sha256.New, key)
	check.Write([]byte("key check value"))
	return &Box{aead: aead, key: key, kcv: hex.EncodeToString(check.Sum(nil)[:8])}, nil
}

// KCV identifies the key without revealing it (stored in the database).
func (b *Box) KCV() string { return b.kcv }

// Derive returns a secondary key for another purpose (e.g. hashing emails),
// so a stolen database alone cannot be dictionary-attacked.
func (b *Box) Derive(label string) []byte {
	mac := hmac.New(sha256.New, b.key)
	mac.Write([]byte(label))
	return mac.Sum(nil)
}

// Seal encrypts plaintext; the result is safe to store as text.
func (b *Box) Seal(plain string) (string, error) {
	if plain == "" {
		return "", nil
	}
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return "v1:" + base64.RawStdEncoding.EncodeToString(b.aead.Seal(nonce, nonce, []byte(plain), nil)), nil
}

// Open decrypts a Seal result.
func (b *Box) Open(sealed string) (string, error) {
	if sealed == "" {
		return "", nil
	}
	raw, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(sealed, "v1:"))
	if err != nil || !strings.HasPrefix(sealed, "v1:") || len(raw) < b.aead.NonceSize() {
		return "", errors.New("secrets: malformed value")
	}
	n := b.aead.NonceSize()
	plain, err := b.aead.Open(nil, raw[:n], raw[n:], nil)
	if err != nil {
		return "", ErrWrongKey
	}
	return string(plain), nil
}
