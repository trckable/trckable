package api

import (
	"net/http"
	"testing"

	"github.com/trckable/trckable/server/internal/secrets"
)

// A lost key has a way out: the owner forgets the unreadable keys and the
// current key becomes the one the data is checked against.
func TestStartOverAfterALostKey(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	// The data was sealed with a key this server no longer has.
	if _, err := g.ctl.DB.Exec(`UPDATE meta SET value = 'from-an-old-key' WHERE key = 'secret_kcv'`); err != nil {
		t.Fatal(err)
	}
	g.rev.KeyErr = secrets.ErrWrongKey

	url := g.srv.URL + "/api/v1/payments/start-over"
	if code, _ := do(t, owner, "POST", url, `{"password":"wrong"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("start over without the owner's password: %d", code)
	}
	if code, out := do(t, owner, "POST", url, `{"password":"correct horse battery"}`, csrf, "1"); code != http.StatusOK {
		t.Fatalf("start over: %d %v", code, out)
	}
	if g.rev.KeyErr != nil {
		t.Fatal("payments still refused after starting over")
	}
	var kcv string
	g.ctl.DB.QueryRow(`SELECT value FROM meta WHERE key = 'secret_kcv'`).Scan(&kcv)
	if kcv != g.rev.Box.KCV() {
		t.Fatalf("the key check was not moved to the current key: %q", kcv)
	}
}
