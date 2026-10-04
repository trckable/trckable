package ga

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"
)

// ChunkDays is how many days one round of requests covers.
const ChunkDays = 60

// Sink is where imported rows go: DuckDB, through the writer.
type Sink interface {
	// Replace makes the days from..to (inclusive) of site hold exactly rows:
	// what was there is removed first, so running it again changes nothing.
	Replace(ctx context.Context, site, from, to string, rows []Row) error
	// Have says whether every day from..to already has its total.
	Have(ctx context.Context, site, from, to string) (bool, error)
}

// Job states.
const (
	Running = "running"
	Done    = "done"
	Paused  = "paused" // quota or a failure: it can go on
	Denied  = "denied" // Google said no, or the sign-in ran out: sign in again
	Stopped = "stopped"
)

// Error codes a job reports; the dashboard turns them into words.
const (
	CodeQuota   = "quota"
	CodeDenied  = "denied"
	CodeExpired = "expired"
	CodeFailed  = "failed"
)

// Snapshot is a job as the dashboard sees it: numbers and codes, never a
// token and never Google's own text.
type Snapshot struct {
	Status   string    `json:"status"`
	Property string    `json:"property"`
	From     string    `json:"from"`
	To       string    `json:"to"`
	Done     int       `json:"done"`
	Total    int       `json:"total"`
	Days     int       `json:"days"` // days imported so far
	Code     string    `json:"code,omitempty"`
	RetryAt  time.Time `json:"retry_at,omitzero"`
}

// perAccount is how many sign-ins one account may hold at once; the oldest
// is dropped for a newer one. overall bounds the whole server.
const (
	perAccount = 10
	overall    = 4096
)

type conn struct {
	account string
	made    time.Time
	user    string
	tok     Secret
	expiry  time.Time
}

type job struct {
	user   string
	site   string
	chunks [][2]string
	snap   Snapshot
	cancel context.CancelFunc
}

// Manager keeps the signed-in connections and the running imports, in
// memory: a restart forgets both, and a second sign-in picks the import up
// where its days left off.
type Manager struct {
	Client *Client
	Sink   Sink
	Now    func() time.Time
	// Changed is told when a range of a site's days was replaced, so reports
	// that were cached can be dropped.
	Changed func(site string)

	mu    sync.Mutex
	conns map[string]*conn // by site and person: two owners of a site do not replace each other
	jobs  map[string]*job  // by site
	wg    sync.WaitGroup
}

func (m *Manager) now() time.Time {
	if m.Now != nil {
		return m.Now()
	}
	return time.Now()
}

func connKey(site, user string) string { return site + "\x00" + user }

// Hold keeps a person's access token for a site, for the import and nothing
// else, and says whether it did: an account holds a few at a time (the
// oldest makes room), and the server holds a bounded number.
func (m *Manager) Hold(account, site, user string, tok Secret, expiry time.Time) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.conns == nil {
		m.conns = map[string]*conn{}
	}
	now := m.now()
	for k, c := range m.conns {
		if now.After(c.expiry) {
			delete(m.conns, k)
		}
	}
	key := connKey(site, user)
	if _, again := m.conns[key]; !again {
		if len(m.conns) >= overall {
			return false
		}
		n, oldest := 0, ""
		for k, c := range m.conns {
			if c.account != account {
				continue
			}
			n++
			if oldest == "" || c.made.Before(m.conns[oldest].made) {
				oldest = k
			}
		}
		if n >= perAccount {
			delete(m.conns, oldest)
		}
	}
	m.conns[key] = &conn{account: account, made: now, user: user, tok: tok, expiry: expiry}
	return true
}

// Token is the held token of this person for this site; false for another
// person's, or none, or one that ran out.
func (m *Manager) Token(site, user string) (Secret, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c := m.conns[connKey(site, user)]
	if c == nil || c.user != user || m.now().After(c.expiry) {
		return Secret{}, false
	}
	return c.tok, true
}

// Connected says whether this person holds a usable sign-in for the site.
func (m *Manager) Connected(site, user string) bool {
	_, ok := m.Token(site, user)
	return ok
}

// Status is the site's import, if there is one. Another person's import of
// the same site is not shown to this one.
func (m *Manager) Status(site, user string) (Snapshot, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j := m.jobs[site]
	if j == nil || j.user != user {
		return Snapshot{}, false
	}
	return j.snap, true
}

// Errors from Start.
var (
	ErrNotSignedIn = errors.New("ga: not signed in with Google")
	ErrRunning     = errors.New("ga: an import of this site is already running")
)

// Start begins importing property for site, from..to (inclusive, YYYY-MM-DD).
// With resume, ranges whose days are all there already are skipped.
func (m *Manager) Start(site, user, property, from, to string, resume bool) (Snapshot, error) {
	if !ValidProperty(property) {
		return Snapshot{}, ErrBadProperty
	}
	chunks := plan(from, to)
	if len(chunks) == 0 {
		return Snapshot{}, errors.New("ga: nothing to import in that range")
	}
	tok, ok := m.Token(site, user)
	if !ok {
		return Snapshot{}, ErrNotSignedIn
	}
	m.mu.Lock()
	if old := m.jobs[site]; old != nil && old.snap.Status == Running {
		m.mu.Unlock()
		return Snapshot{}, ErrRunning
	}
	if m.jobs == nil {
		m.jobs = map[string]*job{}
	}
	ctx, cancel := context.WithCancel(context.Background())
	j := &job{user: user, site: site, chunks: chunks, cancel: cancel,
		snap: Snapshot{Status: Running, Property: property, From: from, To: to, Total: len(chunks)}}
	m.jobs[site] = j
	snap := j.snap
	m.mu.Unlock()
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		m.run(ctx, j, tok, resume)
	}()
	return snap, nil
}

// Resume goes on with a paused import, skipping the ranges that are done.
func (m *Manager) Resume(site, user string) (Snapshot, error) {
	m.mu.Lock()
	j := m.jobs[site]
	if j == nil || j.user != user || j.snap.Status != Paused {
		m.mu.Unlock()
		return Snapshot{}, errors.New("ga: nothing to go on with")
	}
	s := j.snap
	m.mu.Unlock()
	return m.Start(site, user, s.Property, s.From, s.To, true)
}

// Disconnect forgets the token and stops the site's import.
func (m *Manager) Disconnect(site, user string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.conns, connKey(site, user))
	if j := m.jobs[site]; j != nil && j.user == user {
		j.cancel()
		if j.snap.Status == Running || j.snap.Status == Paused {
			j.snap.Status = Stopped
		}
	}
}

// Stop ends every import and forgets every token, and waits for them.
func (m *Manager) Stop() {
	m.mu.Lock()
	for _, j := range m.jobs {
		j.cancel()
	}
	m.conns = nil
	m.mu.Unlock()
	m.wg.Wait()
}

// plan cuts from..to into chunks of ChunkDays.
func plan(from, to string) [][2]string {
	a, err1 := time.Parse("2006-01-02", from)
	b, err2 := time.Parse("2006-01-02", to)
	if err1 != nil || err2 != nil || b.Before(a) {
		return nil
	}
	var out [][2]string
	for s := a; !s.After(b); s = s.AddDate(0, 0, ChunkDays) {
		e := s.AddDate(0, 0, ChunkDays-1)
		if e.After(b) {
			e = b
		}
		out = append(out, [2]string{s.Format("2006-01-02"), e.Format("2006-01-02")})
	}
	return out
}

func (m *Manager) update(j *job, f func(*Snapshot)) {
	m.mu.Lock()
	f(&j.snap)
	m.mu.Unlock()
}

func (m *Manager) finish(j *job, status, code string, retry time.Time, drop bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j.snap.Status == Stopped {
		return
	}
	j.snap.Status, j.snap.Code, j.snap.RetryAt = status, code, retry
	if drop {
		delete(m.conns, connKey(j.site, j.user))
	}
}

func (m *Manager) run(ctx context.Context, j *job, tok Secret, resume bool) {
	for i, ch := range j.chunks {
		if ctx.Err() != nil {
			return
		}
		if m.now().After(m.expiryOf(j)) {
			m.finish(j, Denied, CodeExpired, time.Time{}, true)
			return
		}
		if resume {
			if ok, err := m.Sink.Have(ctx, j.site, ch[0], ch[1]); err == nil && ok {
				m.update(j, func(s *Snapshot) { s.Done = i + 1 })
				continue
			}
		}
		rows, left, err := m.Client.Chunk(ctx, tok, j.snap.Property, ch[0], ch[1])
		if err == nil {
			err = m.Sink.Replace(ctx, j.site, ch[0], ch[1], rows)
			if err == nil && m.Changed != nil {
				m.Changed(j.site)
			}
		}
		if err != nil {
			m.fail(ctx, j, err)
			return
		}
		n := 0
		for _, r := range rows {
			if r.Dim == "total" && (r.Sessions > 0 || r.Users > 0 || r.Views > 0) {
				n++
			}
		}
		m.update(j, func(s *Snapshot) { s.Done = i + 1; s.Days += n })
		if left >= 0 && left < lowTokens && i+1 < len(j.chunks) {
			m.finish(j, Paused, CodeQuota, m.now().Add(time.Hour), false)
			return
		}
		if err := m.Client.sleep(ctx, m.Client.pace()); err != nil {
			return
		}
	}
	m.finish(j, Done, "", time.Time{}, true)
}

func (m *Manager) expiryOf(j *job) time.Time {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c := m.conns[connKey(j.site, j.user)]; c != nil {
		return c.expiry
	}
	return time.Time{}
}

func (m *Manager) fail(ctx context.Context, j *job, err error) {
	var q *QuotaError
	var a *APIError
	switch {
	case ctx.Err() != nil:
		return
	case errors.As(err, &q):
		m.finish(j, Paused, CodeQuota, m.now().Add(q.Wait), false)
	case errors.Is(err, ErrDenied):
		m.finish(j, Denied, CodeDenied, time.Time{}, true)
	case errors.As(err, &a):
		slog.Warn("google analytics import: Google refused a request", "status", a.Status)
		m.finish(j, Paused, CodeFailed, time.Time{}, false)
	default:
		slog.Warn("google analytics import failed", "err", err)
		m.finish(j, Paused, CodeFailed, time.Time{}, false)
	}
}
