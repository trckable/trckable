// Package notice is the one way trckable tells a person something that
// happened: a security change, a change to the team, a site or a channel. A
// notice is written to the outbox before anything is sent, so it is never
// lost to a failing mail server or a busy database: whatever could not be
// delivered is tried again, with growing gaps, for a day. The same outbox
// carries the alerts about a person's sites (Alert), so there is one place a
// delivery is kept and retried.
//
// A notice names its kind (kinds.go) and who it is for (Owners, Managers, a
// Person, an Address); the kind says what the email says and whether the
// dashboard's bell tells it too. Security notices are Always on.
package notice

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/permissions"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The forms an outbox row takes.
const (
	// formNotice is a notice not yet fanned out to its people; it has no target.
	formNotice = "notice"
	// formMail is one notice's email to one address.
	formMail = "mail"
	// formReport is a composed email (an alert's) to one address.
	formReport = "report"
	// formWebhook is an alert's payload for a webhook.
	formWebhook = "webhook"
)

// answered finds the status a mail service or webhook answered with.
var answered = regexp.MustCompile(`answered (\d{3})`)

// errClass is the short class of a failure, the only thing kept or logged of it.
func errClass(err error) string {
	code := ""
	if m := answered.FindStringSubmatch(err.Error()); m != nil {
		code = " (" + m[1] + ")"
	}
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return "timed out"
	case errors.Is(err, context.Canceled):
		return "interrupted"
	case code != "":
		return "refused" + code
	}
	return "send failed"
}

// ErrNoMail is the refusal of an email alert on a server that cannot send
// email: it can never be delivered, so it is not kept.
var ErrNoMail = errors.New("email is not set up on this server")

// backoff are the gaps between tries; the last one repeats until the day is up.
var backoff = []time.Duration{time.Minute, 5 * time.Minute, 15 * time.Minute, 30 * time.Minute, time.Hour, 2 * time.Hour, 4 * time.Hour}

// Store is the outbox and the people it reaches (*sqlite.Store).
type Store interface {
	QueueNotice(ctx context.Context, r sqlite.OutboxRow, now time.Time) (sqlite.OutboxRow, bool, error)
	DueNotices(ctx context.Context, now time.Time, limit int) ([]sqlite.OutboxRow, error)
	NoticeDelivered(ctx context.Context, id string) error
	NoticeRetry(ctx context.Context, id string, tries int, next time.Time, cause string) error
	NoticeGaveUp(ctx context.Context, id string, tries int, cause string) error
	PruneNotices(ctx context.Context, now time.Time) error
	NoticePeople(ctx context.Context, account string) ([]sqlite.NoticePerson, error)
}

// Bell is the dashboard's bell, in a build that has one: it is told once per
// notice, with everyone who should see it.
type Bell interface {
	Tell(ctx context.Context, e BellEntry) error
}

// BellEntry is a notice as the bell keeps it for each person in Users.
type BellEntry struct {
	// Key is the notice's: the same key is told to a person once.
	Key     string
	Kind    string
	Account string
	Site    string
	Users   []string
	Vars    Vars
	At      time.Time
}

// Hub sends notices and keeps what could not be sent.
type Hub struct {
	Store Store
	// Bell is nil in a build without a bell.
	Bell Bell
	// BaseURL is the dashboard's public address, for the buttons in emails.
	BaseURL string
	// Now, Mail and Post are the clock, the mail server and the webhook call;
	// they are fields so tests can replace them.
	Now  func() time.Time
	Mail func(ctx context.Context, to string, r alerts.Report) error
	Post func(ctx context.Context, target string, e alerts.Event) error

	pruned time.Time
	wg     sync.WaitGroup
	forms  map[string]func(ctx context.Context, r sqlite.OutboxRow) error
}

// Audience is who a notice is for.
type Audience struct {
	Who   string `json:"who"`
	Value string `json:"value,omitempty"`
}

// Owners are the owners of the account: billing, team and data notices go
// to them and to nobody else.
func Owners() Audience { return Audience{Who: "owners"} }

// Managers are the people who run the account's sites: owners, and admins
// where there are admins.
func Managers() Audience { return Audience{Who: "managers"} }

// Person is one person of the account, by id.
func Person(id string) Audience { return Audience{Who: "person", Value: id} }

// Address is an email address that belongs to no one on the team (someone
// just removed, an old address): the email only, no bell.
func Address(email string) Audience { return Audience{Who: "address", Value: email} }

// Notice is one thing that happened, for some people.
type Notice struct {
	Kind string `json:"kind"`
	// Key is the event: the same key is the same notice, told once however
	// often it is retried.
	Key     string     `json:"key"`
	Account string     `json:"account"`
	Site    string     `json:"site,omitempty"`
	To      []Audience `json:"to"`
	Vars    Vars       `json:"vars,omitempty"`
	At      int64      `json:"at"`
	// Skip is a person who is left out of every audience: whoever made the
	// change is not told of it, the others are. Security notices leave it empty.
	Skip string `json:"skip,omitempty"`
}

// New starts a notice of a kind with a key of its own: every call is a new event.
func New(kind, account string, to []Audience, vars Vars) Notice {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return Notice{Kind: kind, Key: kind + ":" + hex.EncodeToString(b), Account: account, To: to, Vars: vars}
}

func (h *Hub) now() time.Time {
	if h.Now != nil {
		return h.Now()
	}
	return time.Now()
}

func (h *Hub) mailOn() bool { return h.Mail != nil || alerts.Mail != nil }

func (h *Hub) sendMail(ctx context.Context, to string, r alerts.Report) error {
	if h.Mail != nil {
		return h.Mail(ctx, to, r)
	}
	return alerts.SendReport(ctx, to, r)
}

func (h *Hub) post(ctx context.Context, target string, e alerts.Event) error {
	if h.Post != nil {
		return h.Post(ctx, target, e)
	}
	return alerts.Send(ctx, target, e)
}

// Notify writes the notice and delivers it. Everything after the write is
// retried by the outbox, so an error here means only that the notice could not
// be written, and nothing was sent.
func (h *Hub) Notify(ctx context.Context, n Notice) error {
	if _, ok := Kinds[n.Kind]; !ok {
		return fmt.Errorf("notice: unknown kind %q", n.Kind)
	}
	if n.At == 0 {
		n.At = h.now().Unix()
	}
	body, err := json.Marshal(n)
	if err != nil {
		return err
	}
	row, fresh, err := h.Store.QueueNotice(ctx, sqlite.OutboxRow{Key: n.Key, Account: n.Account, Kind: n.Kind, Form: formNotice, Body: string(body)}, h.now())
	if err != nil || !fresh {
		return err
	}
	h.later(ctx, row)
	return nil
}

// Register adds a form of row the outbox can carry that this package does not
// know: fn does the work for one row and returns an error to have it tried
// again. It is how the server keeps an event whose recipients are only known
// when it is delivered (a site going down), so a failure to look them up
// loses nothing.
func (h *Hub) Register(form string, fn func(ctx context.Context, r sqlite.OutboxRow) error) {
	if h.forms == nil {
		h.forms = map[string]func(context.Context, sqlite.OutboxRow) error{}
	}
	h.forms[form] = fn
}

// Queue writes a row of a registered form and delivers it. A key that is
// already in the outbox is the same event and is left alone.
func (h *Hub) Queue(ctx context.Context, r sqlite.OutboxRow) error {
	if _, ok := h.forms[r.Form]; !ok {
		return fmt.Errorf("notice: unknown form %q", r.Form)
	}
	row, fresh, err := h.Store.QueueNotice(ctx, r, h.now())
	if err != nil || !fresh {
		return err
	}
	h.later(ctx, row)
	return nil
}

// Alert delivers an alert about a site to its target (a mailto: address or a
// webhook) and keeps it until it is delivered: key names the event, so the
// same event is never sent twice. A target that can never be reached (email
// not set up) is ErrNoMail; any other failure of the delivery is retried, and
// any other error means the alert could not be kept.
func (h *Hub) Alert(ctx context.Context, account, key, kind, target string, e alerts.Event) error {
	row := sqlite.OutboxRow{Key: key, Account: account, Kind: kind}
	if addr, ok := strings.CutPrefix(strings.TrimSpace(target), "mailto:"); ok {
		if !h.mailOn() {
			return ErrNoMail
		}
		body, err := json.Marshal(alerts.Compose(e))
		if err != nil {
			return err
		}
		row.Form, row.Target, row.Body = formReport, addr, string(body)
	} else {
		body, err := json.Marshal(e)
		if err != nil {
			return err
		}
		row.Form, row.Target, row.Body = formWebhook, target, string(body)
	}
	row, fresh, err := h.Store.QueueNotice(ctx, row, h.now())
	if err != nil || !fresh {
		return err
	}
	h.later(ctx, row)
	return nil
}

// later delivers a row that is written, without holding up whoever wrote it:
// a slow mail server must not slow a request. The row is already safe in the
// outbox, so a restart before it is done only means the worker takes it over.
func (h *Hub) later(ctx context.Context, r sqlite.OutboxRow) {
	ctx = context.WithoutCancel(ctx)
	h.wg.Add(1)
	go func() {
		defer h.wg.Done()
		ctx, cancel := context.WithTimeout(ctx, time.Minute)
		defer cancel()
		h.settle(ctx, r)
	}()
}

// Wait returns when the deliveries started so far are finished: for tests,
// and for a server that is shutting down.
func (h *Hub) Wait() { h.wg.Wait() }

// Drain tries again what is due. The server calls it every minute.
func (h *Hub) Drain(ctx context.Context) {
	now := h.now()
	rows, err := h.Store.DueNotices(ctx, now, 100)
	if err != nil {
		slog.Warn("notices: could not read the outbox", "why", errClass(err))
		return
	}
	for _, r := range rows {
		if ctx.Err() != nil {
			return
		}
		h.settle(ctx, r)
	}
	if now.Sub(h.pruned) > time.Hour {
		h.pruned = now
		if err := h.Store.PruneNotices(ctx, now); err != nil {
			slog.Warn("notices: could not clear the old ones", "why", errClass(err))
		}
	}
}

// settle makes one try at a row and keeps the outcome: delivered, to try
// again later, or given up on after a day.
func (h *Hub) settle(ctx context.Context, r sqlite.OutboxRow) {
	err := h.run(ctx, r)
	if err == nil {
		if r.Form == formReport || r.Form == formWebhook {
			slog.Info("alert sent", "kind", r.Kind, "tries", r.Tries+1)
		}
		if err := h.Store.NoticeDelivered(context.WithoutCancel(ctx), r.ID); err != nil {
			slog.Warn("notices: delivered but not marked", "kind", r.Kind)
		}
		return
	}
	// Only the class of the failure is kept or logged: the words of a mail
	// server or a webhook can echo an address or a secret path.
	now, tries, why := h.now(), r.Tries+1, errClass(err)
	slog.Warn("notice not delivered yet", "kind", r.Kind, "form", r.Form, "tries", tries, "why", why)
	// The outcome is kept even when the try was cut short by a shutdown.
	ctx = context.WithoutCancel(ctx)
	var mark error
	if now.Sub(time.Unix(r.CreatedAt, 0)) >= sqlite.NoticeGiveUp {
		slog.Error("notice given up on after a day", "kind", r.Kind, "form", r.Form, "why", why)
		mark = h.Store.NoticeGaveUp(ctx, r.ID, tries, why)
	} else {
		mark = h.Store.NoticeRetry(ctx, r.ID, tries, now.Add(backoff[min(tries, len(backoff))-1]), why)
	}
	if mark != nil {
		slog.Warn("notices: could not keep the outcome of a try", "kind", r.Kind)
	}
}

func (h *Hub) run(ctx context.Context, r sqlite.OutboxRow) error {
	switch r.Form {
	case formNotice:
		return h.fanOut(ctx, r)
	case formMail:
		return h.mail(ctx, r)
	case formReport:
		var rep alerts.Report
		if err := json.Unmarshal([]byte(r.Body), &rep); err != nil {
			return fmt.Errorf("notice %s: %w", r.ID, err)
		}
		return h.sendMail(ctx, r.Target, rep)
	case formWebhook:
		var e alerts.Event
		if err := json.Unmarshal([]byte(r.Body), &e); err != nil {
			return fmt.Errorf("notice %s: %w", r.ID, err)
		}
		return h.post(ctx, r.Target, e)
	}
	if fn, ok := h.forms[r.Form]; ok {
		return fn(ctx, r)
	}
	return fmt.Errorf("notice %s: unknown form %q", r.ID, r.Form)
}

// recipient is one person a notice reaches. User is empty for an address.
type recipient struct{ User, Email string }

// resolve turns the audiences into people, once each. Someone who is no longer
// on the account is skipped: they are named by Address when they must hear it.
func resolve(people []sqlite.NoticePerson, to []Audience, skip string) []recipient {
	var out []recipient
	seen := map[string]bool{}
	add := func(user, email string) {
		key := strings.ToLower(strings.TrimSpace(email))
		if key == "" || seen[key] {
			return
		}
		seen[key] = true
		out = append(out, recipient{User: user, Email: email})
	}
	for _, a := range to {
		if a.Who == "address" {
			add("", a.Value)
			continue
		}
		for _, p := range people {
			if skip != "" && p.ID == skip {
				continue
			}
			switch a.Who {
			case "owners":
				if p.Role == sqlite.RoleOwner {
					add(p.ID, p.Email)
				}
			case "managers":
				if permissions.Can(p.Role, permissions.ActChange) {
					add(p.ID, p.Email)
				}
			case "person":
				if p.ID == a.Value {
					add(p.ID, p.Email)
				}
			}
		}
	}
	return out
}

// fanOut turns a notice into its emails and its bell entry. A lookup that fails
// leaves the notice for the next try: it is never answered with fewer people.
func (h *Hub) fanOut(ctx context.Context, r sqlite.OutboxRow) error {
	var n Notice
	if err := json.Unmarshal([]byte(r.Body), &n); err != nil {
		return fmt.Errorf("notice %s: %w", r.ID, err)
	}
	spec := Kinds[n.Kind]
	people, err := h.Store.NoticePeople(ctx, n.Account)
	if err != nil {
		return err
	}
	rs := resolve(people, n.To, n.Skip)
	var fresh []sqlite.OutboxRow
	if spec.Email != nil && h.mailOn() {
		body, err := json.Marshal(mailBody{Kind: n.Kind, Vars: n.Vars, At: n.At})
		if err != nil {
			return err
		}
		for _, p := range rs {
			row, isNew, err := h.Store.QueueNotice(ctx, sqlite.OutboxRow{Key: n.Key + "/" + strings.ToLower(p.Email), Account: n.Account, Kind: n.Kind, Form: formMail, Target: p.Email, Body: string(body)}, h.now())
			if err != nil {
				return err
			}
			if isNew {
				fresh = append(fresh, row)
			}
		}
	}
	if spec.Bell && h.Bell != nil {
		var users []string
		for _, p := range rs {
			if p.User != "" {
				users = append(users, p.User)
			}
		}
		if len(users) > 0 {
			if err := h.Bell.Tell(ctx, BellEntry{Key: n.Key, Kind: n.Kind, Account: n.Account, Site: n.Site, Users: users, Vars: n.Vars, At: time.Unix(n.At, 0)}); err != nil {
				return err
			}
		}
	}
	// The emails are sent after the bell is written, each with a retry of its own.
	for _, row := range fresh {
		h.settle(ctx, row)
	}
	return nil
}

// mailBody is what a notice's email keeps in the outbox: the words are drawn
// when it is sent.
type mailBody struct {
	Kind string `json:"kind"`
	Vars Vars   `json:"vars,omitempty"`
	At   int64  `json:"at"`
}

func (h *Hub) mail(ctx context.Context, r sqlite.OutboxRow) error {
	var b mailBody
	if err := json.Unmarshal([]byte(r.Body), &b); err != nil {
		return fmt.Errorf("notice %s: %w", r.ID, err)
	}
	spec, ok := Kinds[b.Kind]
	if !ok || spec.Email == nil {
		return fmt.Errorf("notice %s: %q has no email", r.ID, b.Kind)
	}
	msg := spec.Email(b.Vars)
	m := email(msg, h.BaseURL)
	return h.sendMail(ctx, r.Target, alerts.Report{FromName: "trckable", Subject: msg.Subject, Text: m.Text(), HTML: m.HTML(), Attachments: alerts.Inline(m), At: time.Unix(b.At, 0)})
}
