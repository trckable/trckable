package alerts

import (
	"github.com/trckable/trckable/server/internal/mailkit"
)

// The footer's links on every alert email.
const (
	linkStop     = "Stop these alerts"
	linkSettings = "Alert settings"
	linkAsk      = "Open in dashboard"
	noteNoStop   = "Sent by trckable. Change or stop it under Settings → Alerts."
)

// Compose is the email an alert becomes: its subject, the kit's HTML and its
// plain-text twin, the pictures it shows, and the stop link in its headers.
func Compose(e Event) Report {
	subject := header(e.Subject)
	if subject == "" {
		subject = header(e.Title)
		if e.Domain != "" {
			subject += " · " + header(e.Domain)
		}
	}
	m := plainEmail(e)
	if e.Email != nil {
		m = *e.Email
	}
	if m.Title == "" {
		m.Title = subject
	}
	stop := m.Foot.StopLabel
	if stop == "" {
		stop = linkStop
	}
	m.Foot.Links = append(m.Foot.Links[:len(m.Foot.Links):len(m.Foot.Links)],
		mailkit.Link{Label: linkAsk, URL: e.Ask}, mailkit.Link{Label: stop, URL: header(e.Unsubscribe)}, mailkit.Link{Label: linkSettings, URL: e.Settings})
	if m.Foot.Note == "" && e.Unsubscribe == "" {
		m.Foot.Note = noteNoStop
	}
	return Report{FromName: "trckable", Subject: subject, Text: m.Text(), HTML: m.HTML(), Unsubscribe: e.Unsubscribe, Attachments: Inline(m), At: e.At}
}

// plainEmail is the email of an alert that brought none: its title and
// message under the site's name.
func plainEmail(e Event) mailkit.Email {
	var blocks []mailkit.Block
	if e.Domain != "" {
		blocks = append(blocks, mailkit.Heading{Title: header(e.Domain)})
	}
	blocks = append(blocks, mailkit.Callout{Title: header(e.Title), Text: e.Message})
	return mailkit.Email{Preheader: mailkit.Cut(e.Message, 140), Blocks: blocks}
}

// Inline are the pictures an email shows, as the files that travel with it.
func Inline(m mailkit.Email) []Attachment {
	var out []Attachment
	for _, p := range m.Images() {
		out = append(out, Attachment{Name: p.Name, Type: p.Type, Data: p.Data, Inline: p.CID})
	}
	return out
}
