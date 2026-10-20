package notice

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

type rig struct {
	hub    *Hub
	st     *sqlite.Store
	clock  time.Time
	owner  sqlite.Person
	owner2 sqlite.Person
	viewer sqlite.Person

	mu       sync.Mutex
	mails    map[string][]alerts.Report // by address
	posts    []string
	mailFail error
	postFail error
	bells    []BellEntry
	bellFail error
}

func (r *rig) sent(to string) []alerts.Report {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.mails[to]
}

func newRig(t *testing.T) *rig {
	t.Helper()
	ctx := context.Background()
	st, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	r := &rig{st: st, clock: time.Date(2026, 10, 20, 9, 0, 0, 0, time.UTC), mails: map[string][]alerts.Report{}}
	add := func(email, role string) sqlite.Person {
		p, err := st.AddUser(ctx, sqlite.DefaultAccount, email, "a long enough password", role)
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	r.owner, r.owner2, r.viewer = add("one@example.com", sqlite.RoleOwner), add("two@example.com", sqlite.RoleOwner), add("view@example.com", sqlite.RoleViewer)
	r.hub = &Hub{
		Store: st, BaseURL: "https://stats.example.com", Now: func() time.Time { return r.clock },
		Mail: func(_ context.Context, to string, rep alerts.Report) error {
			r.mu.Lock()
			defer r.mu.Unlock()
			if r.mailFail != nil {
				return r.mailFail
			}
			r.mails[to] = append(r.mails[to], rep)
			return nil
		},
		Post: func(_ context.Context, target string, _ alerts.Event) error {
			r.mu.Lock()
			defer r.mu.Unlock()
			if r.postFail != nil {
				return r.postFail
			}
			r.posts = append(r.posts, target)
			return nil
		},
	}
	return r
}

func (r *rig) tell(h *Hub) {
	h.Bell = bellFunc(func(_ context.Context, e BellEntry) error {
		r.mu.Lock()
		defer r.mu.Unlock()
		if r.bellFail != nil {
			return r.bellFail
		}
		r.bells = append(r.bells, e)
		return nil
	})
}

type bellFunc func(context.Context, BellEntry) error

func (f bellFunc) Tell(ctx context.Context, e BellEntry) error { return f(ctx, e) }

// sample gives every kind the facts its words use.
var sample = Vars{"by": "Ana", "who": "Ben", "role": "owner", "when": "20 Oct, 09:00 UTC", "place": "Berlin", "browser": "Firefox", "name": "ci", "domain": "example.com", "reason": "no snippet", "from": "365 days", "to": "30 days", "platform": "YouTube", "handle": "@x"}

func TestEveryKindHasWordsAndAMessage(t *testing.T) {
	for _, k := range Names() {
		spec := Kinds[k]
		if !spec.Bell && spec.Email == nil {
			t.Errorf("%s says nothing anywhere", k)
		}
		if strings.HasPrefix(k, "security.") && !spec.Always {
			t.Errorf("%s is a security notice and must always be on", k)
		}
		if spec.Email == nil {
			continue
		}
		m := spec.Email(sample)
		e := email(m, "https://stats.example.com")
		if m.Subject == "" || m.Title == "" || m.Text == "" || m.Note == "" {
			t.Errorf("%s: an email needs a subject, title, text and a note on why it was sent: %+v", k, m)
		}
		if strings.Contains(e.Text(), "%!") || strings.Contains(e.Text(), "<no value>") {
			t.Errorf("%s: the words have a hole: %s", k, e.Text())
		}
	}
}

func TestAnOwnerNoticeReachesEveryOwnerAndNobodyElse(t *testing.T) {
	r := newRig(t)
	ctx := context.Background()
	if err := r.hub.Notify(ctx, New(RetentionShorter, sqlite.DefaultAccount, []Audience{Owners()}, sample)); err != nil {
		t.Fatal(err)
	}
	r.hub.Wait()
	for _, p := range []sqlite.Person{r.owner, r.owner2} {
		if got := r.sent(p.Email); len(got) != 1 || !strings.Contains(got[0].Subject, "retention") && !strings.Contains(strings.ToLower(got[0].Subject), "retention") {
			t.Fatalf("%s got %+v", p.Email, got)
		}
	}
	if got := r.sent(r.viewer.Email); len(got) != 0 {
		t.Fatalf("a viewer was told: %+v", got)
	}
}

func TestEveryKindIsTold(t *testing.T) {
	r := newRig(t)
	r.tell(r.hub)
	ctx := context.Background()
	for _, k := range Names() {
		if err := r.hub.Notify(ctx, New(k, sqlite.DefaultAccount, []Audience{Person(r.owner.ID), Address("gone@example.com")}, sample)); err != nil {
			t.Fatal(k, err)
		}
	}
	r.hub.Wait()
	emails, bells := 0, 0
	for _, k := range Names() {
		if Kinds[k].Email != nil {
			emails++
		}
		if Kinds[k].Bell {
			bells++
		}
	}
	if got := len(r.sent(r.owner.Email)); got != emails {
		t.Fatalf("the person got %d emails, want %d", got, emails)
	}
	if got := len(r.sent("gone@example.com")); got != emails {
		t.Fatalf("the address got %d emails, want %d", got, emails)
	}
	if len(r.bells) != bells {
		t.Fatalf("the bell was told %d times, want %d", len(r.bells), bells)
	}
	for _, b := range r.bells {
		if len(b.Users) != 1 || b.Users[0] != r.owner.ID {
			t.Fatalf("the bell is for the people with an account only: %+v", b)
		}
	}
}

func TestAFailedEmailIsTriedAgainAndSentOnce(t *testing.T) {
	r := newRig(t)
	ctx := context.Background()
	r.mailFail = errors.New("mail server down")
	n := New(PasswordChanged, sqlite.DefaultAccount, []Audience{Person(r.owner.ID)}, sample)
	if err := r.hub.Notify(ctx, n); err != nil {
		t.Fatal(err)
	}
	r.hub.Wait()
	if len(r.sent(r.owner.Email)) != 0 {
		t.Fatal("sent while the server was down")
	}
	// Not due yet: nothing is tried before the first gap has passed.
	r.hub.Drain(ctx)
	r.clock = r.clock.Add(30 * time.Second)
	r.hub.Drain(ctx)
	if len(r.sent(r.owner.Email)) != 0 {
		t.Fatal("tried again too soon")
	}
	r.mu.Lock()
	r.mailFail = nil
	r.mu.Unlock()
	r.clock = r.clock.Add(3 * time.Minute)
	r.hub.Drain(ctx)
	if got := r.sent(r.owner.Email); len(got) != 1 {
		t.Fatalf("after the retry: %d emails", len(got))
	}
	r.clock = r.clock.Add(time.Hour)
	r.hub.Drain(ctx)
	if got := r.sent(r.owner.Email); len(got) != 1 {
		t.Fatalf("a delivered email was sent again: %d", len(got))
	}
	// The same event told again is the same notice.
	if err := r.hub.Notify(ctx, n); err != nil {
		t.Fatal(err)
	}
	r.hub.Wait()
	if got := r.sent(r.owner.Email); len(got) != 1 {
		t.Fatalf("one event was told twice: %d", len(got))
	}
}

func TestTheBellDoesNotWaitForTheEmail(t *testing.T) {
	r := newRig(t)
	r.tell(r.hub)
	r.mailFail = errors.New("mail server down")
	if err := r.hub.Notify(context.Background(), New(MemberRemoved, sqlite.DefaultAccount, []Audience{Owners()}, sample)); err != nil {
		t.Fatal(err)
	}
	r.hub.Wait()
	if len(r.bells) != 1 || len(r.bells[0].Users) != 2 {
		t.Fatalf("the bell: %+v", r.bells)
	}
}

// failingPeople is a database that cannot say who the owners are.
type failingPeople struct {
	Store
	fail *bool
}

func (f failingPeople) NoticePeople(ctx context.Context, account string) ([]sqlite.NoticePerson, error) {
	if *f.fail {
		return nil, errors.New("database is busy")
	}
	return f.Store.NoticePeople(ctx, account)
}

func TestAFailedLookupOfTheOwnersIsRetriedNotAnsweredWithFewerPeople(t *testing.T) {
	r := newRig(t)
	ctx := context.Background()
	fail := true
	r.hub.Store = failingPeople{Store: r.st, fail: &fail}
	if err := r.hub.Notify(ctx, New(RoleChanged, sqlite.DefaultAccount, []Audience{Owners(), Address("who@example.com")}, sample)); err != nil {
		t.Fatal(err)
	}
	r.hub.Wait()
	if len(r.mails) != 0 {
		t.Fatalf("someone was told without the lookup: %+v", r.mails)
	}
	fail = false
	r.clock = r.clock.Add(3 * time.Minute)
	r.hub.Drain(ctx)
	for _, to := range []string{r.owner.Email, r.owner2.Email, "who@example.com"} {
		if got := r.sent(to); len(got) != 1 {
			t.Fatalf("%s got %d emails after the retry", to, len(got))
		}
	}
	if len(r.sent(r.viewer.Email)) != 0 {
		t.Fatal("a viewer was told")
	}
}

func TestABellThatFailsIsRetriedWithoutSendingTheEmailsTwice(t *testing.T) {
	r := newRig(t)
	r.tell(r.hub)
	r.bellFail = errors.New("busy")
	ctx := context.Background()
	if err := r.hub.Notify(ctx, New(RoleChanged, sqlite.DefaultAccount, []Audience{Person(r.owner.ID)}, sample)); err != nil {
		t.Fatal(err)
	}
	r.hub.Wait()
	r.mu.Lock()
	r.bellFail = nil
	r.mu.Unlock()
	r.clock = r.clock.Add(3 * time.Minute)
	r.hub.Drain(ctx)
	r.clock = r.clock.Add(time.Hour)
	r.hub.Drain(ctx)
	if len(r.bells) != 1 {
		t.Fatalf("the bell was told %d times", len(r.bells))
	}
	if got := r.sent(r.owner.Email); len(got) != 1 {
		t.Fatalf("%d emails", len(got))
	}
}

func TestAnUndeliverableNoticeIsGivenUpAfterADay(t *testing.T) {
	r := newRig(t)
	ctx := context.Background()
	r.mailFail = errors.New("mail server down")
	if err := r.hub.Notify(ctx, New(KeyCreated, sqlite.DefaultAccount, []Audience{Person(r.owner.ID)}, sample)); err != nil {
		t.Fatal(err)
	}
	r.hub.Wait()
	for i := 0; i < 30; i++ {
		r.clock = r.clock.Add(time.Hour)
		r.hub.Drain(ctx)
	}
	due, err := r.st.DueNotices(ctx, r.clock.Add(1000*time.Hour), 10)
	if err != nil || len(due) != 0 {
		t.Fatalf("still waiting after a day: %v %+v", err, due)
	}
	r.mu.Lock()
	r.mailFail = nil
	r.mu.Unlock()
	r.hub.Drain(ctx)
	if len(r.sent(r.owner.Email)) != 0 {
		t.Fatal("delivered after it was given up on")
	}
}

func TestAnAlertThatFailsIsRetriedUntilItGoesThrough(t *testing.T) {
	r := newRig(t)
	ctx := context.Background()
	ev := alerts.Event{Kind: "down", Site: "tkb_1", Domain: "example.com", Title: "Your site isn't answering our checks", Message: "Down since 09:00.", At: r.clock}
	r.postFail = errors.New("the webhook answered 500")
	r.mailFail = errors.New("mail server down")
	if err := r.hub.Alert(ctx, sqlite.DefaultAccount, "probe:tkb_1:down:1", "down", "https://hooks.example.com/x", ev); err != nil {
		t.Fatal(err)
	}
	if err := r.hub.Alert(ctx, sqlite.DefaultAccount, "probe:tkb_1:down:1#mail", "down", "mailto:me@example.com", ev); err != nil {
		t.Fatal(err)
	}
	r.hub.Wait()
	if len(r.posts) != 0 || len(r.mails) != 0 {
		t.Fatal("sent while failing")
	}
	r.mu.Lock()
	r.postFail, r.mailFail = nil, nil
	r.mu.Unlock()
	r.clock = r.clock.Add(3 * time.Minute)
	r.hub.Drain(ctx)
	if len(r.posts) != 1 || len(r.sent("me@example.com")) != 1 {
		t.Fatalf("after the retry: %d webhook, %d email", len(r.posts), len(r.sent("me@example.com")))
	}
	if !strings.Contains(r.sent("me@example.com")[0].Subject, "example.com") {
		t.Fatalf("the email: %+v", r.sent("me@example.com")[0])
	}
}

func TestAnEmailAlertWithoutAMailServerIsRefusedNotQueued(t *testing.T) {
	r := newRig(t)
	r.hub.Mail = nil // and alerts.Mail is nil in a test
	if err := r.hub.Alert(context.Background(), "", "k", "down", "mailto:me@example.com", alerts.Event{}); err == nil {
		t.Fatal("an alert that can never be delivered was accepted")
	}
}

func TestAnUnknownKindIsRefused(t *testing.T) {
	r := newRig(t)
	if err := r.hub.Notify(context.Background(), Notice{Kind: "nope", Key: "k"}); err == nil {
		t.Fatal("accepted")
	}
}

func TestTheOneWhoMadeTheChangeIsLeftOut(t *testing.T) {
	r := newRig(t)
	n := New(SiteAdded, sqlite.DefaultAccount, []Audience{Owners()}, sample)
	n.Skip = r.owner.ID
	r.tell(r.hub)
	if err := r.hub.Notify(context.Background(), n); err != nil {
		t.Fatal(err)
	}
	r.hub.Wait()
	if len(r.bells) != 1 || len(r.bells[0].Users) != 1 || r.bells[0].Users[0] != r.owner2.ID {
		t.Fatalf("the bell: %+v", r.bells)
	}
}

// A mail server's words can carry an address or a secret path: only the class
// of a failure is kept in the outbox.
func TestOnlyTheClassOfAFailureIsKept(t *testing.T) {
	r := newRig(t)
	ctx := context.Background()
	r.mailFail = errors.New("the webhook answered 502 for https://hooks.example.com/secret-path to ana@example.com")
	if err := r.hub.Notify(ctx, New(PasswordChanged, sqlite.DefaultAccount, []Audience{Person(r.owner.ID)}, sample)); err != nil {
		t.Fatal(err)
	}
	r.hub.Wait()
	var kept []string
	rows, err := r.st.DB.QueryContext(ctx, `SELECT last_error FROM notice_outbox WHERE last_error <> ''`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var e string
		_ = rows.Scan(&e)
		kept = append(kept, e)
	}
	if len(kept) != 1 || kept[0] != "refused (502)" {
		t.Fatalf("kept: %q", kept)
	}
}

func TestEveryRowKnowsWhoseItIs(t *testing.T) {
	r := newRig(t)
	ctx := context.Background()
	if err := r.hub.Notify(ctx, New(MemberRemoved, sqlite.DefaultAccount, []Audience{Address("gone@example.com"), Owners()}, sample)); err != nil {
		t.Fatal(err)
	}
	r.hub.Wait()
	var n, own int
	if err := r.st.DB.QueryRowContext(ctx, `SELECT count(*), count(CASE WHEN account = ? THEN 1 END) FROM notice_outbox`, sqlite.DefaultAccount).Scan(&n, &own); err != nil || n != 4 || own != n {
		t.Fatalf("%d rows, %d with the account: %v", n, own, err)
	}
}

// An alert about a site's numbers is in the bell of the people who run the
// account's sites, under its own key (so a retry is the same entry); a viewer is not
// told, and neither is an alert the bell has no place for.
func TestAnAlertReachesTheBellOfTheTeamThatRunsTheSite(t *testing.T) {
	r := newRig(t)
	r.tell(r.hub)
	ctx := context.Background()
	ev := alerts.Event{Kind: "threshold", Site: "tkb_site", Domain: "example.com", Title: "10 sales today", Message: "example.com reached 10 sales today.",
		Data: map[string]any{"metric": "sales", "period": "day", "amount": "10", "value": 12.0}}
	for range 2 {
		if err := r.hub.Alert(ctx, sqlite.DefaultAccount, "alert:a1:2026-10-20", "threshold", "mailto:me@example.com", ev); err != nil {
			t.Fatal(err)
		}
		r.hub.Wait()
	}
	if len(r.bells) != 2 {
		t.Fatalf("the bell was told %d times for a retried alert, want the same entry twice", len(r.bells))
	}
	b := r.bells[0]
	if b.Kind != AlertThreshold || b.Key != "alert:a1:2026-10-20" || b.Site != "tkb_site" || b.Vars["domain"] != "example.com" || b.Vars["metric"] != "sales" || b.Vars["period"] != "day" || b.Vars["amount"] != "10" {
		t.Fatalf("the entry: %+v", b)
	}
	got := map[string]bool{}
	for _, u := range b.Users {
		got[u] = true
	}
	if len(got) != 2 || !got[r.owner.ID] || !got[r.owner2.ID] || got[r.viewer.ID] {
		t.Fatalf("told: %v", b.Users)
	}
	if err := r.hub.Alert(ctx, sqlite.DefaultAccount, "uptime:1", "down", "mailto:me@example.com", alerts.Event{Kind: "down", Domain: "example.com"}); err != nil {
		t.Fatal(err)
	}
	r.hub.Wait()
	if len(r.bells) != 2 {
		t.Fatalf("an alert the bell has no place for was told: %d", len(r.bells))
	}
}
