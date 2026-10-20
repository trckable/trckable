package secrets

import "log/slog"

// Secret holds a token or a client secret. It prints, logs and marshals as
// a placeholder, so a careless log line or error response cannot leak it; the
// value is read only with Reveal, where it is sent to the service it belongs to.
type Secret struct{ v string }

// NewSecret wraps s.
func NewSecret(s string) Secret { return Secret{v: s} }

// Reveal is the value. Use it only to send it to its service.
func (s Secret) Reveal() string { return s.v }

// Empty says whether there is no value.
func (s Secret) Empty() bool { return s.v == "" }

func (Secret) String() string               { return "[redacted]" }
func (Secret) GoString() string             { return "[redacted]" }
func (Secret) MarshalJSON() ([]byte, error) { return []byte(`"[redacted]"`), nil }
func (Secret) MarshalText() ([]byte, error) { return []byte("[redacted]"), nil }

// LogValue keeps slog from printing the value.
func (Secret) LogValue() slog.Value { return slog.StringValue("[redacted]") }
