package alerts

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/http"
	"net/textproto"
	"strings"
	"time"
)

// A scheduled report is a different email from an alert: HTML with a plain
// text twin, an inline logo and a PDF. It goes to one person at a time, each
// with their own link to stop it.

// Attachment is a file that rides with a report: the PDF, or the inline logo
// the HTML refers to as cid:<Inline>.
type Attachment struct {
	Name   string
	Type   string
	Data   []byte
	Inline string // a content id: the file is part of the HTML, not a download
}

// Report is one report email.
type Report struct {
	FromName    string // who it is from; the site's name, or trckable's
	Subject     string
	Text, HTML  string
	Unsubscribe string // the address that stops it for this person
	Attachments []Attachment
	At          time.Time
}

// SendReport sends a report to one address through this instance's mail
// server. It is an error when email is not set up.
func SendReport(ctx context.Context, to string, r Report) error {
	if Mail == nil {
		return errors.New("email is not set up on this server: set TRCKABLE_SMTP_URL")
	}
	addr, ok := mailAddress("mailto:" + to)
	if !ok {
		return errors.New("that is not an email address")
	}
	return Mail.sendReport(ctx, addr, r)
}

func (m *Mailer) sendReport(ctx context.Context, to string, r Report) error {
	if m.resend != nil {
		return m.resend.sendReport(ctx, m.from, to, r)
	}
	raw, err := buildReport(m.from, to, r)
	if err != nil {
		return err
	}
	return m.deliver(ctx, to, raw)
}

// reportHeaders are the headers mail clients read for their own Unsubscribe
// button, besides the plain ones.
func reportHeaders(r Report) [][2]string {
	h := [][2]string{{"Auto-Submitted", "auto-generated"}}
	if u := header(r.Unsubscribe); u != "" {
		h = append(h, [2]string{"List-Unsubscribe", "<" + u + ">"}, [2]string{"List-Unsubscribe-Post", "List-Unsubscribe=One-Click"})
	}
	return h
}

// displayName is a sender's name made safe for a header.
func displayName(s string) string {
	s = strings.TrimSpace(header(s))
	if s == "" {
		return "trckable"
	}
	return s
}

func qp(s string) []byte {
	var b bytes.Buffer
	w := quotedprintable.NewWriter(&b)
	_, _ = w.Write([]byte(s))
	_ = w.Close()
	return b.Bytes()
}

// buildReport writes the whole message: mixed (the files) around alternative
// (text, then HTML with its inline files). Line ends are CRLF throughout.
func buildReport(from, to string, r Report) ([]byte, error) {
	var out bytes.Buffer
	hdr := func(k, v string) { out.WriteString(k + ": " + v + "\r\n") }
	hdr("From", mime.QEncoding.Encode("utf-8", displayName(r.FromName))+" <"+from+">")
	hdr("To", "<"+to+">")
	hdr("Subject", mime.QEncoding.Encode("utf-8", header(r.Subject)))
	hdr("Date", r.At.Format(time.RFC1123Z))
	hdr("MIME-Version", "1.0")
	for _, h := range reportHeaders(r) {
		hdr(h[0], h[1])
	}
	var inline, files []Attachment
	for _, a := range r.Attachments {
		if a.Inline != "" {
			inline = append(inline, a)
		} else {
			files = append(files, a)
		}
	}
	mixed := multipart.NewWriter(&out)
	hdr("Content-Type", `multipart/mixed; boundary="`+mixed.Boundary()+`"`)
	out.WriteString("\r\n")
	part := func(w *multipart.Writer, h textproto.MIMEHeader) (io.Writer, error) { return w.CreatePart(h) }

	// The alternative: text first, the HTML last (the richest is last).
	ap, err := part(mixed, textproto.MIMEHeader{"Content-Type": {"multipart/alternative; boundary=\"alt-" + mixed.Boundary() + "\""}})
	if err != nil {
		return nil, err
	}
	altW := multipart.NewWriter(ap)
	_ = altW.SetBoundary("alt-" + mixed.Boundary())
	tp, _ := altW.CreatePart(textproto.MIMEHeader{"Content-Type": {"text/plain; charset=utf-8"}, "Content-Transfer-Encoding": {"quoted-printable"}})
	_, _ = tp.Write(qp(r.Text))
	if len(inline) == 0 {
		hp, _ := altW.CreatePart(textproto.MIMEHeader{"Content-Type": {"text/html; charset=utf-8"}, "Content-Transfer-Encoding": {"quoted-printable"}})
		_, _ = hp.Write(qp(r.HTML))
	} else {
		rel := "rel-" + mixed.Boundary()
		rp, _ := altW.CreatePart(textproto.MIMEHeader{"Content-Type": {"multipart/related; boundary=\"" + rel + "\"; type=\"text/html\""}})
		relW := multipart.NewWriter(rp)
		_ = relW.SetBoundary(rel)
		hp, _ := relW.CreatePart(textproto.MIMEHeader{"Content-Type": {"text/html; charset=utf-8"}, "Content-Transfer-Encoding": {"quoted-printable"}})
		_, _ = hp.Write(qp(r.HTML))
		for _, a := range inline {
			ip, _ := relW.CreatePart(textproto.MIMEHeader{
				"Content-Type": {a.Type}, "Content-Transfer-Encoding": {"base64"},
				"Content-ID": {"<" + a.Inline + ">"}, "Content-Disposition": {`inline; filename="` + header(a.Name) + `"`},
			})
			writeBase64(ip, a.Data)
		}
		if err := relW.Close(); err != nil {
			return nil, err
		}
	}
	if err := altW.Close(); err != nil {
		return nil, err
	}
	for _, a := range files {
		fp, err := part(mixed, textproto.MIMEHeader{
			"Content-Type": {a.Type + `; name="` + header(a.Name) + `"`}, "Content-Transfer-Encoding": {"base64"},
			"Content-Disposition": {`attachment; filename="` + header(a.Name) + `"`},
		})
		if err != nil {
			return nil, err
		}
		writeBase64(fp, a.Data)
	}
	if err := mixed.Close(); err != nil {
		return nil, err
	}
	return bytes.ReplaceAll(bytes.ReplaceAll(out.Bytes(), []byte("\r\n"), []byte("\n")), []byte("\n"), []byte("\r\n")), nil
}

// writeBase64 writes data as base64 in lines of 76 characters.
func writeBase64(w io.Writer, data []byte) {
	enc := base64.StdEncoding.EncodeToString(data)
	for len(enc) > 76 {
		_, _ = io.WriteString(w, enc[:76]+"\r\n")
		enc = enc[76:]
	}
	_, _ = io.WriteString(w, enc+"\r\n")
}

// sendReport sends a report through Resend's HTTPS API.
func (r *resendAPI) sendReport(ctx context.Context, from, to string, rep Report) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	h := map[string]string{}
	for _, kv := range reportHeaders(rep) {
		h[kv[0]] = kv[1]
	}
	var atts []map[string]any
	for _, a := range rep.Attachments {
		m := map[string]any{"filename": header(a.Name), "content": base64.StdEncoding.EncodeToString(a.Data), "content_type": a.Type}
		if a.Inline != "" {
			m["content_id"] = a.Inline
		}
		atts = append(atts, m)
	}
	payload, err := json.Marshal(map[string]any{
		"from": fmt.Sprintf("%s <%s>", strings.NewReplacer(`"`, "", "<", "", ">", "").Replace(displayName(rep.FromName)), from),
		"to":   []string{to}, "subject": header(rep.Subject), "text": rep.Text, "html": rep.HTML, "headers": h, "attachments": atts,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.key)
	req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("mail service: %w", withoutURL(err))
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 300))
		return fmt.Errorf("mail service answered %d: %s", res.StatusCode, bytes.TrimSpace(msg))
	}
	_, _ = io.Copy(io.Discard, res.Body)
	return nil
}
