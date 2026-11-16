package api

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	msqlite "modernc.org/sqlite"

	"github.com/trckable/trckable/server/internal/revenue"
)

// countConnector opens connections that count their SELECTs.
type countConnector struct {
	dsn string
	n   *atomic.Int64
}

func (c countConnector) Connect(context.Context) (driver.Conn, error) {
	inner, err := (&msqlite.Driver{}).Open(c.dsn)
	if err != nil {
		return nil, err
	}
	return &countConn{Conn: inner, n: c.n}, nil
}
func (c countConnector) Driver() driver.Driver { return &msqlite.Driver{} }

type countConn struct {
	driver.Conn
	n *atomic.Int64
}

func (c *countConn) QueryContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	if strings.HasPrefix(strings.TrimSpace(strings.ToUpper(q)), "SELECT") {
		c.n.Add(1)
	}
	return c.Conn.(driver.QueryerContext).QueryContext(ctx, q, args)
}

func (c *countConn) ExecContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Result, error) {
	return c.Conn.(driver.ExecerContext).ExecContext(ctx, q, args)
}

func (c *countConn) BeginTx(ctx context.Context, o driver.TxOptions) (driver.Tx, error) {
	return c.Conn.(driver.ConnBeginTx).BeginTx(ctx, o)
}

// counted swaps the rig's databases for ones that count their SELECTs.
func (g *rig) counted(t *testing.T) *atomic.Int64 {
	t.Helper()
	var file string
	var seq int
	var name string
	if err := g.ctl.DB.QueryRow(`PRAGMA database_list`).Scan(&seq, &name, &file); err != nil {
		t.Fatal(err)
	}
	n := &atomic.Int64{}
	db := sql.OpenDB(countConnector{dsn: "file:" + file + "?_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)", n: n})
	db.SetMaxOpenConns(4)
	t.Cleanup(func() { db.Close() })
	g.ctl.DB, g.rev.DB = db, db
	return n
}

func (g *rig) rawSites(t *testing.T) []byte {
	t.Helper()
	req, _ := http.NewRequest("GET", g.srv.URL+"/api/v1/sites", nil)
	req.Header.Set("Authorization", "Bearer automation-token")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 {
		t.Fatalf("sites: %d %s", res.StatusCode, b)
	}
	return b
}

// The list reads the settings, the snooze and the sources of all its sites at
// once; each row must say what the per-site reads said.
func TestSitesListBatchesWhatItReadsPerSite(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	ids := []string{g.site}
	for i := range 7 {
		id, err := g.ctl.CreateSite(ctx, "acc_default", fmt.Sprintf("s%d.example.com", i), "")
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	// Different states: week start, cookie mode, no settings row at all, a snooze
	// that is on and one that is over, a search connection, a payment connection.
	for i, id := range ids {
		c, _ := g.ctl.SiteConfig(ctx, id)
		c.WeekStart = i % 2
		c.ConsentFree = i%3 == 0
		if err := g.ctl.SetSiteConfig(ctx, id, c); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := g.ctl.DB.Exec(`DELETE FROM site_settings WHERE site_id = ?`, ids[2]); err != nil {
		t.Fatal(err)
	}
	if err := g.ctl.MuteAlerts(ctx, ids[1], g.now.Add(time.Hour).Unix()); err != nil {
		t.Fatal(err)
	}
	if err := g.ctl.MuteAlerts(ctx, ids[3], g.now.Add(-time.Hour).Unix()); err != nil {
		t.Fatal(err)
	}
	if err := g.ctl.SetSearchConsoleKey(ctx, ids[4], "sealed", "bot@example.com"); err != nil {
		t.Fatal(err)
	}
	if _, err := g.rev.Connect(ctx, revenue.ConnectRequest{Site: ids[5], Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"}); err != nil {
		t.Fatal(err)
	}

	n := g.counted(t)
	g.api.cache.lists.purge()
	n.Store(0)
	body := g.rawSites(t)
	after := n.Load()

	var got struct {
		Sites []siteListRow `json:"sites"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Sites) != len(ids) {
		t.Fatalf("%d sites, want %d", len(got.Sites), len(ids))
	}
	n.Store(0)
	for _, s := range got.Sites {
		week, cookieless := 1, true
		if c, err := g.ctl.SiteConfig(ctx, s.ID); err == nil {
			week, cookieless = c.WeekStart, c.ConsentFree
		}
		var muted int64
		if until := g.ctl.MutedUntil(ctx, s.ID); until > g.api.Now().Unix() {
			muted = until
		}
		if s.WeekStart != week || s.Cookieless != cookieless || s.AlertsMutedUntil != muted {
			t.Errorf("%s: week %d cookieless %v muted %d, want %d %v %d", s.ID, s.WeekStart, s.Cookieless, s.AlertsMutedUntil, week, cookieless, muted)
		}
		if want := g.api.verifiedOf(ctx, s.SiteInfo); !reflect.DeepEqual(s.Verified, want) {
			t.Errorf("%s: sources %+v, want %+v", s.ID, s.Verified, want)
		}
	}
	before := after - 3 + n.Load()
	t.Logf("sites list, %d sites: %d queries before, %d after", len(ids), before, after)
	if after >= before {
		t.Errorf("%d queries is not fewer than the %d per-site reads made", after, before)
	}
}

// A second poll inside the window is answered from the shared list; a change
// to a site shows at once.
func TestSitesListIsSharedBriefly(t *testing.T) {
	g := newRig(t)
	n := g.counted(t)
	g.api.cache.lists.purge()
	n.Store(0)
	first := g.rawSites(t)
	cost := n.Load()
	if again := g.rawSites(t); string(again) != string(first) || n.Load() != cost {
		t.Errorf("the second poll read the store (%d queries, %d before) or differed", n.Load(), cost)
	}
	req, _ := http.NewRequest("POST", g.srv.URL+"/api/v1/sites/"+g.site+"/alerts/mute", strings.NewReader(`{"hours":2}`))
	req.Header.Set("Authorization", "Bearer automation-token")
	req.Header.Set("Content-Type", "application/json")
	if res, err := http.DefaultClient.Do(req); err != nil || res.StatusCode >= 300 {
		t.Fatalf("mute: %v %v", err, res)
	}
	if after := g.rawSites(t); !strings.Contains(string(after), `"alerts_muted_until":`) || string(after) == string(first) {
		t.Errorf("a muted site did not show at once: %s", after)
	}
	g.advance(listTTL + time.Second)
	n.Store(0)
	g.rawSites(t)
	if n.Load() == 0 {
		t.Error("the list outlived its window")
	}
}
