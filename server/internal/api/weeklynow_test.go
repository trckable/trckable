package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
)

// The report goes to the person who pressed the button, three times a day at
// most, and only where this server can send email.
func TestSendWeeklyNow(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	url := g.srv.URL + "/api/v1/sites/" + g.site + "/alerts/weekly/send"
	var sent []string
	g.api.SendWeekly = func(_ context.Context, site, email string) error {
		sent = append(sent, site+" "+email)
		return nil
	}
	old := alerts.Mail
	t.Cleanup(func() { alerts.Mail = old })

	alerts.Mail = nil
	if code, out := do(t, owner, "POST", url, ``, csrf, "1"); code != http.StatusConflict || !strings.Contains(out["error"].(string), "email is not set up") {
		t.Fatalf("without a mail server: %d %v", code, out)
	}
	alerts.Mail = &alerts.Mailer{}
	// Whatever address the request carries, the report goes to the person asking.
	var email string
	for i := 1; i <= weeklyNowPerDay; i++ {
		code, out := do(t, owner, "POST", url, `{"to":"someone@else.example","target":"https://evil.example"}`, csrf, "1")
		if code != http.StatusOK {
			t.Fatalf("press %d: %d %v", i, code, out)
		}
		email, _ = out["sent_to"].(string)
	}
	if email == "" || len(sent) != weeklyNowPerDay || sent[0] != g.site+" "+email {
		t.Fatalf("sent %v to %q", sent, email)
	}
	if code, out := do(t, owner, "POST", url, ``, csrf, "1"); code != http.StatusTooManyRequests {
		t.Fatalf("a fourth press in a day: %d %v", code, out)
	}
	if len(sent) != weeklyNowPerDay {
		t.Fatalf("a refused press sent mail: %v", sent)
	}
	// Another day starts the count again.
	g.advance(25 * time.Hour)
	if code, out := do(t, owner, "POST", url, ``, csrf, "1"); code != http.StatusOK {
		t.Fatalf("the next day: %d %v", code, out)
	}
}
