package server

import (
	"io"
	"log"
	"regexp"
)

// The HTTP server writes a few lines of its own, and one of them names the
// visitor: "http: panic serving 1.2.3.4:56789: …". trckable stores no IP
// address anywhere, logs included, so those lines lose the address first.
var addrLike = regexp.MustCompile(`\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b|\[[0-9A-Fa-f:.%]+\](?::\d+)?|\b[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{0,4}){2,7}`)

type scrubbed struct{ w io.Writer }

func (s scrubbed) Write(p []byte) (int, error) {
	if _, err := s.w.Write(addrLike.ReplaceAll(p, []byte("[address]"))); err != nil {
		return 0, err
	}
	return len(p), nil
}

// serverLog is the HTTP server's own error log, without addresses.
func serverLog(w io.Writer) *log.Logger { return log.New(scrubbed{w}, "", 0) } // the host timestamps each line
