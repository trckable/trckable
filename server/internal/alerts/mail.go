package alerts

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"net/url"
	"strings"
	"time"
)

// Email is the second way an alert can arrive, for people who would rather
// read a Monday report in their inbox than in a chat channel. It needs an
// SMTP server the owner already has (TRCKABLE_SMTP_URL); without one, alerts
// stay webhooks and nothing here runs.

// Mailer sends alerts through one SMTP server.
type Mailer struct {
	host, port string
	implicit   bool // smtps://: TLS from the first byte (port 465)
	auth       smtp.Auth
	from       string
}

// Mail is the instance's mailer, or nil when email is not set up.
var Mail *Mailer

// ParseMailer reads smtp://user:pass@host:587 (STARTTLS) or
// smtps://user:pass@host:465 (TLS throughout). from is the sender address.
func ParseMailer(raw, from string) (*Mailer, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "smtp" && u.Scheme != "smtps") || u.Hostname() == "" {
		return nil, errors.New("TRCKABLE_SMTP_URL looks like smtp://user:password@smtp.example.com:587")
	}
	if _, err := mail.ParseAddress(from); err != nil {
		return nil, errors.New("TRCKABLE_MAIL_FROM must be an email address, like trckable@example.com")
	}
	m := &Mailer{host: u.Hostname(), port: u.Port(), implicit: u.Scheme == "smtps", from: from}
	if m.port == "" {
		m.port = "587"
		if m.implicit {
			m.port = "465"
		}
	}
	if u.User != nil {
		pass, _ := u.User.Password()
		// PlainAuth refuses to send a password over an unencrypted connection
		// (except to localhost), which is the behaviour we want.
		m.auth = smtp.PlainAuth("", u.User.Username(), pass, m.host)
	}
	return m, nil
}

// mailAddress returns the address in a mailto: target.
func mailAddress(target string) (string, bool) {
	addr, ok := strings.CutPrefix(strings.TrimSpace(target), "mailto:")
	if !ok {
		return "", false
	}
	a, err := mail.ParseAddress(addr)
	if err != nil {
		return "", false
	}
	return a.Address, true
}

// header strips line breaks, so a site name or title can never add a header.
func header(s string) string { return strings.NewReplacer("\r", " ", "\n", " ").Replace(s) }

func (m *Mailer) send(ctx context.Context, to string, e Event) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	d := net.Dialer{}
	addr := net.JoinHostPort(m.host, m.port)
	var conn net.Conn
	var err error
	if m.implicit {
		conn, err = (&tls.Dialer{NetDialer: &d, Config: &tls.Config{ServerName: m.host}}).DialContext(ctx, "tcp", addr)
	} else {
		conn, err = d.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("mail server: %w", err)
	}
	if dl, ok := ctx.Deadline(); ok {
		conn.SetDeadline(dl)
	}
	c, err := smtp.NewClient(conn, m.host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("mail server: %w", err)
	}
	defer c.Close()
	if !m.implicit {
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(&tls.Config{ServerName: m.host}); err != nil {
				return fmt.Errorf("mail server TLS: %w", err)
			}
		}
	}
	if m.auth != nil {
		if err := c.Auth(m.auth); err != nil {
			return fmt.Errorf("mail server sign-in: %w", err)
		}
	}
	if err := c.Mail(m.from); err != nil {
		return err
	}
	if err := c.Rcpt(to); err != nil {
		return err
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	subject := header(e.Title)
	if e.Domain != "" {
		subject += " · " + header(e.Domain)
	}
	body := strings.ReplaceAll(e.Message, "\n", "\r\n")
	fmt.Fprintf(w, "From: trckable <%s>\r\nTo: <%s>\r\nSubject: %s\r\nDate: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\nAuto-Submitted: auto-generated\r\n\r\n%s\r\n\r\n-- \r\nSent by trckable. Change or stop it under Settings → Alerts.\r\n",
		m.from, to, subject, e.At.Format(time.RFC1123Z), body)
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
}
