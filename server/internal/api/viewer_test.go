package api

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/http"
	"sort"
	"testing"
)

// volatile tables and columns change on any signed-in call by design (when a
// session, person or key was last seen): bookkeeping, not the instance's data.
var (
	volatile        = map[string]bool{"sessions": true}
	volatileColumns = map[string]bool{"users.last_seen_at": true, "api_keys.last_used_at": true}
)

// fingerprint hashes every row of every table, so two calls to it differ
// exactly when something was written in between.
func fingerprint(t *testing.T, db *sql.DB) string {
	t.Helper()
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		t.Fatal(err)
	}
	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		if !volatile[name] {
			tables = append(tables, name)
		}
	}
	rows.Close()
	h := sha256.New()
	for _, table := range tables {
		fmt.Fprintf(h, "\x00%s\x00", table)
		r, err := db.Query(`SELECT * FROM "` + table + `"`) //nolint:gosec // table names come from sqlite_master
		if err != nil {
			t.Fatal(err)
		}
		cols, _ := r.Columns()
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		var lines []string
		for r.Next() {
			if err := r.Scan(ptrs...); err != nil {
				t.Fatal(err)
			}
			for i, c := range cols {
				if volatileColumns[table+"."+c] {
					vals[i] = nil
				}
			}
			lines = append(lines, fmt.Sprintf("%v", vals))
		}
		r.Close()
		// Rows come in no promised order; the set of them is what counts.
		sort.Strings(lines)
		for _, l := range lines {
			fmt.Fprintln(h, l)
		}
	}
	return hex.EncodeToString(h.Sum(nil))
}

// seedSecrets gives the owner's account one of each thing that holds a
// secret and returns the secrets by name.
func seedSecrets(t *testing.T, g *rig, owner *http.Client, key string) map[string]string {
	t.Helper()
	base := g.srv.URL + "/api/v1/sites/" + g.site
	out := map[string]string{"the API key": key}

	code, conn := do(t, owner, "POST", base+"/payments", `{"provider":"stripe"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("connect stripe: %d %v", code, conn)
	}
	const stripeSecret = "whsec_viewer_probe_7f3a" //nolint:gosec // a fake secret the test plants and looks for
	if code, _ := do(t, owner, "PATCH", base+"/payments/"+conn["id"].(string), `{"secret":"`+stripeSecret+`"}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("set secret: %d", code)
	}
	out["a payment signing secret"] = stripeSecret

	code, custom := do(t, owner, "POST", base+"/payments", `{"provider":"custom"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("connect custom: %d %v", code, custom)
	}
	_, sec := do(t, owner, "GET", base+"/payments/"+custom["id"].(string)+"/secret", "")
	s, _ := sec["secret"].(string)
	if s == "" {
		t.Fatalf("custom secret: %v", sec)
	}
	out["a generated payment secret"] = s

	code, share := do(t, owner, "POST", base+"/shares", `{"name":"Probe"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("share: %d %v", code, share)
	}
	url := share["url"].(string)
	out["a share link's token"] = url[len(url)-26:]
	return out
}
