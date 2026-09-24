package ingest

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Visitor cookie format (trckable_vid): "<id base36>.<first-seen unix seconds base36>".
// Carrying first-seen inside the id makes new-vs-returning a pure function of
// the event, with no visitors table to look up or keep in sync.

// parseVisitor decodes a trckable_vid value.
func parseVisitor(v string) (id uint64, firstSeenMs int64, ok bool) {
	i := strings.IndexByte(v, '.')
	if i <= 0 || len(v) > 40 {
		return 0, 0, false
	}
	id, err := strconv.ParseUint(v[:i], 36, 64)
	if err != nil || id == 0 {
		return 0, 0, false
	}
	secs, err := strconv.ParseInt(v[i+1:], 36, 64)
	if err != nil || secs <= 0 {
		return 0, 0, false
	}
	return id, secs * 1000, true
}

// NewVisitor mints a fresh trckable_vid value.
func NewVisitor(now time.Time) (value string, id uint64, firstSeenMs int64) {
	id = randU64()
	secs := now.Unix()
	return strconv.FormatUint(id, 36) + "." + strconv.FormatInt(secs, 36), id, secs * 1000
}

func randU64() uint64 {
	var b [8]byte
	for {
		if _, err := rand.Read(b[:]); err != nil {
			panic(err) // crypto/rand never fails on supported platforms
		}
		if v := binary.LittleEndian.Uint64(b[:]); v != 0 {
			return v
		}
	}
}

// Salts provides the daily random salt for cookieless visitor hashes. A salt
// is only ever used for one UTC day and is forgotten after that, so hashes
// cannot be linked across days (plan §5.5).
type Salts struct {
	mu    sync.Mutex
	day   string
	salt  []byte
	store SaltStore
}

// SaltStore persists the current day's salt so a restart within the same day
// doesn't split every visitor into two.
type SaltStore interface {
	DailySalt(day string, fresh []byte) ([]byte, error)
}

func NewSalts(store SaltStore) *Salts { return &Salts{store: store} }

func (s *Salts) forDay(now time.Time) []byte {
	day := now.UTC().Format("2006-01-02")
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.day == day {
		return s.salt
	}
	fresh := make([]byte, 32)
	rand.Read(fresh)
	salt := fresh
	if s.store != nil {
		if got, err := s.store.DailySalt(day, fresh); err == nil {
			salt = got
		}
	}
	s.day, s.salt = day, salt
	return salt
}

// Cookieless returns an anonymous visitor id: hash(daily salt, site, ip, ua).
// The IP is used here and never stored.
func (s *Salts) Cookieless(now time.Time, site, ip, ua string) uint64 {
	h := sha256.New()
	h.Write(s.forDay(now))
	h.Write([]byte(site))
	h.Write([]byte{0})
	h.Write([]byte(ip))
	h.Write([]byte{0})
	h.Write([]byte(ua))
	sum := h.Sum(nil)
	v := binary.LittleEndian.Uint64(sum[:8])
	if v == 0 {
		v = 1
	}
	return v
}
