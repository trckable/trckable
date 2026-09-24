package api

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/payments"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// providerInfo tells the dashboard how to connect each provider.
type providerInfo struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	KeyHint  string   `json:"key_hint"`  // what API key to paste (one-key setup)
	KeyURL   string   `json:"key_url"`   // where to create it
	Events   []string `json:"events"`    // for manual webhook setup
	HasModes bool     `json:"has_modes"` // separate sandbox/test API (the key doesn't say)
}

var providers = []providerInfo{
	{"stripe", "Stripe", "A restricted key (rk_live_…) with Webhook Endpoints: write and read access to Events, PaymentIntents, Checkout Sessions, Invoices, Refunds, Disputes.", "https://dashboard.stripe.com/apikeys", payments.StripeEvents, false},
	{"lemonsqueezy", "Lemon Squeezy", "An API key (Settings → API). Live and test-mode events both arrive.", "https://app.lemonsqueezy.com/settings/api", payments.LemonSqueezyEvents, false},
	{"polar", "Polar", "An organization access token with webhooks:write, orders:read and refunds:read.", "https://polar.sh/dashboard", payments.PolarEvents, true},
	{"paddle", "Paddle", "An API key with notification settings (write), transactions and adjustments (read). Sandbox keys (pdl_sdbx_…) connect the sandbox.", "https://vendors.paddle.com/authentication-v2", payments.PaddleEvents, false},
	{"dodo", "Dodo Payments", "An API key from Developer → API keys (test and live keys are separate).", "https://app.dodopayments.com", payments.DodoEvents, true},
	{"custom", "Anything else", "No key: trckable makes a signing secret, and your own code sends each sale to the URL below. Gumroad, Chargebee, Creem, a bank transfer you record by hand — anything that can make an HTTP request.", "", payments.CustomEvents, false},
}

func (a *API) revenueOn(w http.ResponseWriter) bool {
	if a.Revenue == nil {
		fail(w, http.StatusServiceUnavailable, "payments are not enabled on this server")
		return false
	}
	return true
}

// publicBase is where providers must send webhooks: TRCKABLE_BASE_URL, else
// the address the owner is using right now.
func (a *API) publicBase(r *http.Request) string {
	if a.BaseURL != "" {
		return strings.TrimSuffix(a.BaseURL, "/")
	}
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

func (a *API) siteExists(w http.ResponseWriter, r *http.Request) bool {
	if _, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site")); err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return false
	}
	return true
}

func (a *API) payConnections(w http.ResponseWriter, r *http.Request) {
	if !a.revenueOn(w) || !a.siteExists(w, r) {
		return
	}
	list, err := a.Revenue.Connections(r.Context(), r.PathValue("site"), a.publicBase(r))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := map[string]any{"connections": list, "providers": providers, "webhook_base": a.publicBase(r)}
	if a.Revenue.KeyErr != nil {
		out["key_error"] = a.Revenue.KeyErr.Error()
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *API) payConnect(w http.ResponseWriter, r *http.Request) {
	if !a.revenueOn(w) || !a.siteExists(w, r) {
		return
	}
	var in struct {
		Provider, Mode string
		APIKey         string `json:"api_key"`
		Secret         string `json:"secret"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	c, err := a.Revenue.Connect(r.Context(), revenue.ConnectRequest{
		Site: r.PathValue("site"), Provider: in.Provider, Mode: in.Mode, APIKey: in.APIKey, Secret: in.Secret, PublicBase: a.publicBase(r),
	})
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	// Connecting a provider is the whole point of the revenue module, so turn
	// it on here: otherwise payments would arrive and the dashboard would keep
	// showing no money at all.
	if err := (modules.Store{DB: a.Ctl.DB}).Set(r.Context(), r.PathValue("site"), "revenue", true); err != nil {
		slog.Warn("could not turn the revenue module on", "site", r.PathValue("site"), "err", err)
	}
	a.cache.purgeSite(r.PathValue("site"))
	writeJSON(w, http.StatusCreated, c)
}

func (a *API) paySetSecret(w http.ResponseWriter, r *http.Request) {
	if !a.revenueOn(w) {
		return
	}
	var in struct{ Secret string }
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := a.Revenue.SetSecret(r.Context(), r.PathValue("site"), r.PathValue("id"), in.Secret); err != nil {
		code := http.StatusBadRequest
		if errors.Is(err, auth.ErrNotFound) {
			code = http.StatusNotFound
		}
		fail(w, code, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) payDisconnect(w http.ResponseWriter, r *http.Request) {
	if !a.revenueOn(w) {
		return
	}
	if err := a.Revenue.Disconnect(r.Context(), r.PathValue("site"), r.PathValue("id")); err != nil {
		code := http.StatusInternalServerError
		if errors.Is(err, auth.ErrNotFound) {
			code = http.StatusNotFound
		}
		fail(w, code, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) owned(w http.ResponseWriter, r *http.Request) bool {
	list, err := a.Revenue.Connections(r.Context(), r.PathValue("site"), "")
	if err == nil {
		for _, c := range list {
			if c.ID == r.PathValue("id") {
				return true
			}
		}
	}
	fail(w, http.StatusNotFound, "connection not found")
	return false
}

func (a *API) paySync(w http.ResponseWriter, r *http.Request) {
	if !a.revenueOn(w) || !a.owned(w, r) {
		return
	}
	n, err := a.Revenue.Sync(r.Context(), r.PathValue("id"), 30*24*time.Hour)
	if err != nil {
		fail(w, http.StatusBadGateway, err.Error())
		return
	}
	a.Revenue.Process(r.Context())
	a.cache.purgeSite(r.PathValue("site"))
	writeJSON(w, http.StatusOK, map[string]int{"added": n})
}

// paySecret shows a manual connection's signing secret once more (Lemon
// Squeezy manual setup: the owner pastes it into the provider).
func (a *API) paySecret(w http.ResponseWriter, r *http.Request) {
	if !a.revenueOn(w) || !a.owned(w, r) {
		return
	}
	if p, ok := r.Context().Value(ctxKey{}).(principal); !ok || p.user == nil || p.user.Role != sqlite.RoleOwner {
		fail(w, http.StatusForbidden, "only a signed-in owner can read signing secrets")
		return
	}
	sec, err := a.Revenue.Secret(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]string{"secret": sec})
}

func (a *API) payReprocess(w http.ResponseWriter, r *http.Request) {
	if !a.revenueOn(w) || !a.siteExists(w, r) {
		return
	}
	n, err := a.Revenue.Reprocess(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.cache.purgeSite(r.PathValue("site"))
	writeJSON(w, http.StatusOK, map[string]int{"events": n})
}

// PurgeSite drops cached reports (called when the ledger changes).
func (a *API) PurgeSite(site string) {
	a.init()
	a.cache.purgeSite(site)
}
