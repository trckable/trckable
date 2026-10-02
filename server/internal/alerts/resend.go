package alerts

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// resendAPI sends one email through Resend's HTTPS API. Hosts such as
// Railway block outgoing SMTP ports; port 443 is open everywhere.
type resendAPI struct {
	key      string
	endpoint string // tests point it elsewhere
}

func (r *resendAPI) send(ctx context.Context, from, to, subject, body string, headers [][2]string) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	h := map[string]string{}
	for _, kv := range headers {
		h[kv[0]] = kv[1]
	}
	payload, err := json.Marshal(map[string]any{"from": "trckable <" + from + ">", "to": []string{to}, "subject": subject, "text": body, "headers": h})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.key)
	req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("mail service: %w", withoutURL(err))
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		// The answer names the problem (an unverified sender, a bad key) and never echoes the key.
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 300))
		return fmt.Errorf("mail service answered %d: %s", res.StatusCode, bytes.TrimSpace(msg))
	}
	_, _ = io.Copy(io.Discard, res.Body)
	return nil
}
