package alerts

import (
	"fmt"
	"time"

	"github.com/trckable/trckable/server/internal/mailkit"
)

// CodeMail is the sign-in code email: why it was sent, the code, and where the
// request came from, so a request nobody made stands out.
type CodeMail struct {
	Code      string // "331 983"
	Source    string // "the trckable mobile app", "trckable on the web"
	Requester string // "Pixel 8 (Android)", "a web browser"
	Place     string // "Berlin, Germany", empty when unknown
	At        time.Time
}

// Email is the code email on the kit.
func (c CodeMail) Email() mailkit.Email {
	return mailkit.Email{
		Title:     "Sign in to " + c.Source,
		Preheader: "Your code is " + c.Code + ". It works for 10 minutes.",
		Blocks: []mailkit.Block{
			mailkit.Heading{Title: "Sign in to " + c.Source},
			mailkit.Paragraph{Text: "Someone asked to sign in to " + c.Source + " with this email address."},
			mailkit.Code{Code: c.Code},
			mailkit.Paragraph{Text: "Enter it in the app. It works for 10 minutes."},
			mailkit.Rows{Rows: [][2]string{{"Requested from", c.Requester}, {"When", c.At.UTC().Format("2 Jan 2006, 15:04 MST")}, {"Where", c.Place}}[:c.rows()]},
			mailkit.Paragraph{Muted: true, Text: "Didn't ask for it? Ignore this email; nobody can sign in without the code."},
		},
		Foot: mailkit.Foot{Note: "You get this because someone asked for a sign-in code for this address."},
	}
}

// rows leaves the place out when it is not known.
func (c CodeMail) rows() int {
	if c.Place == "" {
		return 2
	}
	return 3
}

// Text is the plain-text twin.
func (c CodeMail) Text() string { return c.Email().Text() }

// HTML is the branded page.
func (c CodeMail) HTML() string { return c.Email().HTML() }

// Report is the email, ready to send.
func (c CodeMail) Report(subject string) Report {
	m := c.Email()
	return Report{FromName: "trckable", Subject: subject, Text: m.Text(), HTML: m.HTML(), Attachments: Inline(m), At: c.At}
}

// Ago is a span in words a person says: "35 minutes", "6 hours", "3 days".
func Ago(d time.Duration) string {
	n, unit := int(d.Minutes()), "minute"
	switch {
	case d >= 48*time.Hour:
		n, unit = int(d.Hours()/24), "day"
	case d >= time.Hour:
		n, unit = int(d.Hours()), "hour"
	}
	if n < 1 {
		n = 1
	}
	if n == 1 {
		return "1 " + unit
	}
	return fmt.Sprintf("%d %ss", n, unit)
}
