package api

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A customer's details are for a signed-in person: signed out is refused, an
// API key or the automation token (no person) is refused, and a customer that
// does not exist is not found.
func TestCustomerDetailIsForSignedInPeople(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	_ = modules.Store{DB: g.ctl.DB}.Set(context.Background(), g.site, "revenue", true)
	day := time.Now().UTC().Format("2006-01-02")
	url := g.srv.URL + "/api/v1/sites/" + g.site + "/sales/customers/abc123?from=" + day + "&to=" + day

	if code, _ := do(t, client(), "GET", url, ""); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
	if code, _ := do(t, client(), "GET", url, "", "Authorization", "Bearer automation-token"); code != http.StatusForbidden {
		t.Fatalf("a token with no person: %d", code)
	}
	if code, _ := do(t, owner, "GET", url, ""); code != http.StatusNotFound {
		t.Fatalf("no such customer: %d", code)
	}
}

// Every customer the list shows opens, including one the ledger keys by a
// single payment (no provider customer id: a guest checkout): the payments and
// totals come from the ledger, and there is simply no name. A viewer may open
// it, as they may read the list; another account's site does not exist.
func TestCustomerDetailOpensEveryListedCustomer(t *testing.T) {
	o := newGolden(t)
	at := o.now().Add(-2 * time.Hour)
	o.sale("guest1", at, 0, 4900)
	day := at.Format("2006-01-02")
	q := "?from=" + day + "&to=" + day
	_, list := do(t, o.c, "GET", o.base+"/sales/customers"+q, "")
	rows, _ := list["customers"].([]any)
	if len(rows) != 1 {
		t.Fatalf("customers: %v", list)
	}
	id := rows[0].(map[string]any)["id"].(string)

	code, out := do(t, o.c, "GET", o.base+"/sales/customers/"+id+q, "")
	pays, _ := out["payments"].([]any)
	if code != http.StatusOK || len(pays) != 1 || out["name"] != nil {
		t.Fatalf("a guest customer: %d %v", code, out)
	}

	ctx := context.Background()
	if _, err := o.g.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	viewer := client()
	if code := o.g.loginWith(t, viewer, "viewer@site.com", "correct horse battery V"); code != http.StatusOK {
		t.Fatalf("viewer signs in: %d", code)
	}
	if code, _ := do(t, viewer, "GET", o.base+"/sales/customers/"+id+q, ""); code != http.StatusOK {
		t.Fatalf("a viewer reads a customer as they read the list: %d", code)
	}

	acc, _ := o.g.ctl.CreateAccount(ctx)
	if _, err := o.g.ctl.AddUser(ctx, acc, "owner@other.com", "correct horse battery B", sqlite.RoleOwner); err != nil {
		t.Fatal(err)
	}
	theirs, _ := o.g.ctl.CreateSite(ctx, acc, "other.com", "Other")
	other := client()
	if code := o.g.loginWith(t, other, "owner@other.com", "correct horse battery B"); code != http.StatusOK {
		t.Fatalf("other owner signs in: %d", code)
	}
	if code, _ := do(t, other, "GET", o.g.srv.URL+"/api/v1/sites/"+o.g.site+"/sales/customers/"+id+q, ""); code != http.StatusNotFound {
		t.Fatalf("another account reads this site's customer: %d", code)
	}
	if code, _ := do(t, other, "GET", o.g.srv.URL+"/api/v1/sites/"+theirs+"/sales/customers/"+id+q, ""); code != http.StatusNotFound && code != http.StatusForbidden {
		t.Fatalf("their own site has no such customer: %d", code)
	}
}
