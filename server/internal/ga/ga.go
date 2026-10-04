// Package ga imports a site's history from Google Analytics 4 with the
// person's own Google sign-in: pick a property, and the daily totals (and the
// top sources, pages, countries and devices of each day) come in through the
// Data API. It is read-only (one scope, analytics.readonly), it never asks
// for a refresh token, and the access token lives in memory for the import
// and is never written anywhere.
//
// No SDK. The protocol is the authorization-code flow with PKCE (x/oauth2
// does the token exchange) and three JSON endpoints.
package ga

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

// Scope is read-only: trckable never asks for anything it could change.
const Scope = "https://www.googleapis.com/auth/analytics.readonly"

// Secret holds a token or a client secret. It prints, logs and marshals as
// a placeholder, so a careless log line or error response cannot leak it; the
// value is read only with Reveal, where it is sent to Google.
type Secret struct{ v string }

// NewSecret wraps s.
func NewSecret(s string) Secret { return Secret{v: s} }

// Reveal is the value. Use it only to send it to Google.
func (s Secret) Reveal() string { return s.v }

// Empty says whether there is no value.
func (s Secret) Empty() bool { return s.v == "" }

func (Secret) String() string               { return "[redacted]" }
func (Secret) GoString() string             { return "[redacted]" }
func (Secret) MarshalJSON() ([]byte, error) { return []byte(`"[redacted]"`), nil }
func (Secret) MarshalText() ([]byte, error) { return []byte("[redacted]"), nil }

// LogValue keeps slog from printing the value.
func (Secret) LogValue() slog.Value { return slog.StringValue("[redacted]") }

// Where the requests go. Fields of Client so tests can stand in for Google;
// production never changes them.
const (
	authEndpoint  = "https://accounts.google.com/o/oauth2/v2/auth"
	tokenEndpoint = "https://oauth2.googleapis.com/token" //nolint:gosec // a public endpoint URL, not a credential
	adminBase     = "https://analyticsadmin.googleapis.com/v1beta"
	dataBase      = "https://analyticsdata.googleapis.com/v1beta"
)

// Client talks to Google for one configured OAuth client: the self-hoster's
// own, or one that Google has verified.
type Client struct {
	ID     string
	Secret Secret
	HTTP   *http.Client // nil: a client with a timeout

	AuthURL, TokenURL, AdminURL, DataURL string // the real ones when empty

	// Pace is the least time between two Data API requests; zero is 600 ms,
	// negative none (tests).
	Pace time.Duration
	// Sleep waits d or until ctx ends; nil is a timer.
	Sleep func(ctx context.Context, d time.Duration) error
	// Retries is how often a throttled request is tried again before the
	// import pauses; zero is 2.
	Retries int
}

// Configured says whether there is an OAuth client to sign in with.
func (c *Client) Configured() bool { return c != nil && c.ID != "" && !c.Secret.Empty() }

func (c *Client) http() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: 30 * time.Second}
}

func pick(v, def string) string {
	if v != "" {
		return v
	}
	return def
}

func (c *Client) oauth(redirect string) *oauth2.Config {
	return &oauth2.Config{
		ClientID: c.ID, ClientSecret: c.Secret.Reveal(), RedirectURL: redirect, Scopes: []string{Scope},
		Endpoint: oauth2.Endpoint{AuthURL: pick(c.AuthURL, authEndpoint), TokenURL: pick(c.TokenURL, tokenEndpoint)},
	}
}

// SignInURL is Google's consent page, with a PKCE challenge made from
// verifier and state to be checked on the way back. access_type=online: no
// refresh token is asked for, so nothing long-lived can ever exist.
func (c *Client) SignInURL(redirect, state, verifier string) string {
	return c.oauth(redirect).AuthCodeURL(state, oauth2.AccessTypeOnline, oauth2.S256ChallengeOption(verifier))
}

// Exchange trades the code (and the PKCE verifier) for an access token. The
// error never carries the code or the token.
func (c *Client) Exchange(ctx context.Context, redirect, code, verifier string) (Secret, time.Time, error) {
	if code == "" || verifier == "" {
		return Secret{}, time.Time{}, errors.New("ga: a code and a verifier are needed")
	}
	ctx = context.WithValue(ctx, oauth2.HTTPClient, c.http())
	tok, err := c.oauth(redirect).Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return Secret{}, time.Time{}, errors.New("ga: Google did not accept the sign-in")
	}
	if tok.AccessToken == "" {
		return Secret{}, time.Time{}, errors.New("ga: Google sent no access token")
	}
	exp := tok.Expiry
	if exp.IsZero() {
		exp = time.Now().Add(time.Hour)
	}
	return NewSecret(tok.AccessToken), exp, nil
}

// Errors an import tells apart.
var (
	ErrDenied = errors.New("ga: Google refused the access (the sign-in ended, or the account cannot read this property)")
	// ErrBadProperty: the id is not a GA4 property.
	ErrBadProperty = errors.New("ga: not a GA4 property")
)

// QuotaError is Google saying slow down: the import pauses, and can go on.
type QuotaError struct{ Wait time.Duration }

func (e *QuotaError) Error() string {
	return "ga: Google's quota for this property is used up for now"
}

// APIError is another refusal, with Google's status (never its text: that is
// not ours to put in a page).
type APIError struct{ Status int }

func (e *APIError) Error() string { return "ga: Google answered " + strconv.Itoa(e.Status) }

var propertyRE = regexp.MustCompile(`^properties/[0-9]{1,20}$`)

// ValidProperty says whether s is a property resource name.
func ValidProperty(s string) bool { return propertyRE.MatchString(s) }

func (c *Client) sleep(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	if c.Sleep != nil {
		return c.Sleep(ctx, d)
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// call sends one request with the token and decodes the JSON answer. A
// throttled answer is tried again, a little later, and then reported as a
// QuotaError.
func (c *Client) call(ctx context.Context, tok Secret, method, u string, body any, into any) error {
	var raw []byte
	if body != nil {
		raw, _ = json.Marshal(body)
	}
	tries := c.Retries
	if tries == 0 {
		tries = 2
	}
	wait := 2 * time.Second
	for attempt := 0; ; attempt++ {
		req, err := http.NewRequestWithContext(ctx, method, u, bytes.NewReader(raw))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+tok.Reveal())
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, err := c.http().Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return errors.New("ga: could not reach Google") // the request's own error holds the address, not the token, but nothing here needs it
		}
		data, rerr := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
		resp.Body.Close()
		if rerr != nil {
			return errors.New("ga: Google's answer was cut off")
		}
		switch {
		case resp.StatusCode/100 == 2:
			if into == nil {
				return nil
			}
			if err := json.Unmarshal(data, into); err != nil {
				return errors.New("ga: Google's answer could not be read")
			}
			return nil
		case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden && !throttled(data):
			return ErrDenied
		case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable || resp.StatusCode == http.StatusForbidden:
			if s, err := strconv.Atoi(resp.Header.Get("Retry-After")); err == nil && s > 0 && s <= 60 {
				wait = time.Duration(s) * time.Second
			}
			if attempt >= tries {
				return &QuotaError{Wait: 5 * time.Minute}
			}
			if err := c.sleep(ctx, wait); err != nil {
				return err
			}
			wait *= 2
		default:
			return &APIError{Status: resp.StatusCode}
		}
	}
}

// throttled tells a 403 that is a quota from one that is a refusal.
func throttled(body []byte) bool {
	s := string(body)
	return strings.Contains(s, "RESOURCE_EXHAUSTED") || strings.Contains(s, "rateLimitExceeded") || strings.Contains(s, "quota")
}

// Property is one GA4 property the person can read.
type Property struct {
	ID      string `json:"id"` // properties/123
	Name    string `json:"name"`
	Account string `json:"account"`
}

// Properties lists the GA4 properties the signed-in person can read, from the
// Admin API's account summaries.
func (c *Client) Properties(ctx context.Context, tok Secret) ([]Property, error) {
	base := pick(c.AdminURL, adminBase) + "/accountSummaries"
	out := []Property{}
	page := ""
	for i := 0; i < 20; i++ {
		q := url.Values{"pageSize": {"200"}}
		if page != "" {
			q.Set("pageToken", page)
		}
		var res struct {
			AccountSummaries []struct {
				DisplayName       string `json:"displayName"`
				PropertySummaries []struct {
					Property    string `json:"property"`
					DisplayName string `json:"displayName"`
				} `json:"propertySummaries"`
			} `json:"accountSummaries"`
			NextPageToken string `json:"nextPageToken"`
		}
		if err := c.call(ctx, tok, http.MethodGet, base+"?"+q.Encode(), nil, &res); err != nil {
			return nil, err
		}
		for _, a := range res.AccountSummaries {
			for _, p := range a.PropertySummaries {
				if ValidProperty(p.Property) {
					out = append(out, Property{ID: p.Property, Name: clip(p.DisplayName, 120), Account: clip(a.DisplayName, 120)})
				}
			}
		}
		if res.NextPageToken == "" {
			break
		}
		page = res.NextPageToken
	}
	return out, nil
}

func clip(s string, n int) string {
	if len(s) > n {
		return strings.ToValidUTF8(s[:n], "")
	}
	return s
}

// Row is one imported number: a day, and either the day's total (Dim
// "total") or one value of a dimension (source, medium, page, country,
// device).
type Row struct {
	Day      string // YYYY-MM-DD
	Dim      string
	Value    string
	Sessions uint64
	Users    uint64
	Views    uint64
}

// Dims are the breakdowns asked of GA4, with the Data API's name for each.
var Dims = []struct{ Dim, API string }{
	{"source", "sessionSource"},
	{"medium", "sessionMedium"},
	{"page", "pagePath"},
	{"country", "countryId"},
	{"device", "deviceCategory"},
}

// TopPerDay is how many values of one dimension are kept for a day.
const TopPerDay = 25

const (
	pageLimit = 10000 // rows per request
	maxPages  = 20    // per report: 200,000 rows
	lowTokens = 60    // pause the import when this few of the hour's tokens are left
)

type report struct {
	Dims  []string
	Rows  [][]string // dimension values, then metric values
	Quota int64      // tokens left this hour; -1 when Google did not say
}

// run fetches one report for a range, every page of it.
func (c *Client) run(ctx context.Context, tok Secret, property, from, to, dim string) (report, error) {
	rep := report{Quota: -1}
	dims := []map[string]string{{"name": "date"}}
	if dim != "" {
		dims = append(dims, map[string]string{"name": dim})
	}
	u := pick(c.DataURL, dataBase) + "/" + property + ":runReport"
	for page := 0; page < maxPages; page++ {
		body := map[string]any{
			"dateRanges":          []map[string]string{{"startDate": from, "endDate": to}},
			"dimensions":          dims,
			"metrics":             []map[string]string{{"name": "sessions"}, {"name": "totalUsers"}, {"name": "screenPageViews"}},
			"orderBys":            []map[string]any{{"dimension": map[string]string{"dimensionName": "date"}}},
			"limit":               pageLimit,
			"offset":              page * pageLimit,
			"returnPropertyQuota": true,
		}
		var res struct {
			Rows []struct {
				DimensionValues []struct{ Value string } `json:"dimensionValues"`
				MetricValues    []struct{ Value string } `json:"metricValues"`
			} `json:"rows"`
			RowCount      int `json:"rowCount"`
			PropertyQuota struct {
				TokensPerHour struct {
					Remaining *int64 `json:"remaining"`
				} `json:"tokensPerHour"`
			} `json:"propertyQuota"`
		}
		if err := c.call(ctx, tok, http.MethodPost, u, body, &res); err != nil {
			return rep, err
		}
		for _, r := range res.Rows {
			row := make([]string, 0, len(r.DimensionValues)+len(r.MetricValues))
			for _, v := range r.DimensionValues {
				row = append(row, v.Value)
			}
			for _, v := range r.MetricValues {
				row = append(row, v.Value)
			}
			rep.Rows = append(rep.Rows, row)
		}
		if q := res.PropertyQuota.TokensPerHour.Remaining; q != nil {
			rep.Quota = *q
		}
		if len(res.Rows) < pageLimit || (page+1)*pageLimit >= res.RowCount {
			break
		}
		if err := c.sleep(ctx, c.pace()); err != nil {
			return rep, err
		}
	}
	return rep, nil
}

func (c *Client) pace() time.Duration {
	switch {
	case c.Pace == 0:
		return 600 * time.Millisecond
	case c.Pace < 0:
		return 0
	}
	return c.Pace
}

// maxMetric bounds a number from Google: no real count is larger, and a
// sum of many never overflows.
const maxMetric = 1_000_000_000_000

func atou(s string) uint64 {
	n := atouRaw(s)
	if n > maxMetric {
		return maxMetric
	}
	return n
}

func atouRaw(s string) uint64 {
	n, err := strconv.ParseUint(strings.TrimSpace(s), 10, 64)
	if err != nil {
		f, ferr := strconv.ParseFloat(s, 64)
		if ferr != nil || f < 0 {
			return 0
		}
		return uint64(f)
	}
	return n
}

// day turns GA's 20240131 into 2024-01-31.
func day(s string) (string, bool) {
	if len(s) != 8 {
		return "", false
	}
	t, err := time.Parse("20060102", s)
	if err != nil {
		return "", false
	}
	return t.Format("2006-01-02"), true
}

// cleanValue is a dimension value as it is kept: no query string on a page
// (it is where emails and tokens end up), a device with a capital, nothing
// Google marks as unknown, and nothing long.
func cleanValue(dim, v string) string {
	v = strings.TrimSpace(v)
	switch dim {
	case "page":
		if i := strings.IndexAny(v, "?#"); i >= 0 {
			v = v[:i]
		}
		if v == "" {
			return ""
		}
	case "device":
		if v != "" {
			v = strings.ToUpper(v[:1]) + v[1:]
		}
	case "country":
		v = strings.ToUpper(v)
		if len(v) != 2 {
			return ""
		}
	}
	if v == "(not set)" || v == "(not provided)" {
		return ""
	}
	return clip(v, 200)
}

// Chunk reads one range of days: a total for every day in it (zero for a day
// Google has nothing for, so the day is known to be done), and the top values
// of each dimension for the days that had visits. left is how many of the
// hour's tokens Google says remain; -1 when it did not say.
func (c *Client) Chunk(ctx context.Context, tok Secret, property, from, to string) (rows []Row, left int64, err error) {
	if !ValidProperty(property) {
		return nil, -1, ErrBadProperty
	}
	left = -1
	tot, err := c.run(ctx, tok, property, from, to, "")
	if err != nil {
		return nil, left, err
	}
	left = tot.Quota
	seen := map[string]bool{}
	var busy bool
	for _, r := range tot.Rows {
		d, ok := day(r[0])
		if !ok || len(r) < 4 {
			continue
		}
		row := Row{Day: d, Dim: "total", Sessions: atou(r[1]), Users: atou(r[2]), Views: atou(r[3])}
		seen[d] = true
		busy = busy || row.Sessions > 0 || row.Users > 0 || row.Views > 0
		rows = append(rows, row)
	}
	for t, end := mustDay(from), mustDay(to); !t.After(end); t = t.AddDate(0, 0, 1) {
		if d := t.Format("2006-01-02"); !seen[d] {
			rows = append(rows, Row{Day: d, Dim: "total"})
		}
	}
	if !busy {
		return rows, left, nil
	}
	for _, d := range Dims {
		if left >= 0 && left < lowTokens {
			return nil, left, &QuotaError{Wait: time.Hour}
		}
		if err := c.sleep(ctx, c.pace()); err != nil {
			return nil, left, err
		}
		rep, err := c.run(ctx, tok, property, from, to, d.API)
		if err != nil {
			return nil, left, err
		}
		if rep.Quota >= 0 {
			left = rep.Quota
		}
		rows = append(rows, topPerDay(d.Dim, rep.Rows)...)
	}
	return rows, left, nil
}

func mustDay(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

// topPerDay folds a dimension's rows into per-day, per-value counts (two
// raw values can clean to one, like a page with two query strings) and keeps
// the busiest TopPerDay of each day.
func topPerDay(dim string, raw [][]string) []Row {
	type key struct{ day, value string }
	sum := map[key]*Row{}
	days := map[string][]*Row{}
	for _, r := range raw {
		if len(r) < 5 {
			continue
		}
		d, ok := day(r[0])
		v := cleanValue(dim, r[1])
		if !ok || v == "" {
			continue
		}
		k := key{d, v}
		row := sum[k]
		if row == nil {
			row = &Row{Day: d, Dim: dim, Value: v}
			sum[k] = row
			days[d] = append(days[d], row)
		}
		row.Sessions += atou(r[2])
		row.Users += atou(r[3])
		row.Views += atou(r[4])
	}
	var out []Row
	for _, list := range days {
		sortRows(list)
		if len(list) > TopPerDay {
			list = list[:TopPerDay]
		}
		for _, r := range list {
			out = append(out, *r)
		}
	}
	return out
}

func sortRows(list []*Row) {
	sort.Slice(list, func(i, j int) bool { return less(list[i], list[j]) })
}

func less(a, b *Row) bool {
	if a.Users != b.Users {
		return a.Users > b.Users
	}
	if a.Sessions != b.Sessions {
		return a.Sessions > b.Sessions
	}
	return a.Value < b.Value
}
