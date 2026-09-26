package api

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// deleteSite removes a site, its control-plane rows and its analytics data.
// Analytics live in DuckDB, where only the writer may write, so the purge is
// handed to it as a maintenance job.
func (a *API) deleteSite(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	info, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	// Deleting a site throws away its history, so the caller has to name it.
	var in struct {
		Domain string `json:"domain"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if !strings.EqualFold(strings.TrimSpace(in.Domain), info.Domain) {
		fail(w, http.StatusBadRequest, "type the site's domain to confirm")
		return
	}
	var gone sqlite.Removed
	if a.PurgeAnalytics != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute) // a busy site can hold millions of rows
		defer cancel()
		events, sessions, err := a.PurgeAnalytics(ctx, site)
		if err != nil {
			fail(w, http.StatusServiceUnavailable, "could not remove this site's analytics data: "+err.Error())
			return
		}
		gone.Events, gone.Sessions = events, sessions
	}
	rest, err := a.Ctl.DeleteSite(r.Context(), site)
	if err != nil {
		code := http.StatusInternalServerError
		if errors.Is(err, auth.ErrNotFound) {
			code = http.StatusNotFound
		}
		fail(w, code, err.Error())
		return
	}
	gone.Payments, gone.Connections = rest.Payments, rest.Connections
	a.sweepAnalytics(r.Context(), site, &gone)
	a.cache.purgeSite(site)
	slog.Info("site deleted", "site", site, "domain", info.Domain, "events", gone.Events, "sessions", gone.Sessions, "payments", gone.Payments)
	writeJSON(w, http.StatusOK, gone)
}

// sweepAnalytics purges a deleted site's analytics once more, now that its
// row is gone. Events the writer applied between the first purge and the
// delete would otherwise stay; after this the writer sees no such site and
// drops whatever is still queued for it. The site is already gone, so a
// failure here is logged rather than reported as a failed delete.
func (a *API) sweepAnalytics(ctx context.Context, site string, gone *sqlite.Removed) {
	if a.PurgeAnalytics == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Minute)
	defer cancel()
	events, sessions, err := a.PurgeAnalytics(ctx, site)
	if err != nil {
		slog.Warn("deleted site: could not sweep late analytics rows", "site", site, "err", err)
		return
	}
	gone.Events += events
	gone.Sessions += sessions
}

// changePassword needs the current password, and signs every other session out.
func (a *API) changePassword(w http.ResponseWriter, r *http.Request) {
	// Each of these does real work (outside fetches, or a password hash):
	// limited, so a busy button or a stolen session cannot make it a flood.
	if !a.loginRate.allow("password:"+a.ip(r), a.Now(), 10, 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "too many tries: wait a few minutes")
		return
	}
	u := r.Context().Value(ctxKey{}).(principal).user
	if u == nil {
		fail(w, http.StatusForbidden, "only a signed-in user can change a password")
		return
	}
	var in struct {
		Current  string `json:"current"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if len(in.Password) < 12 {
		fail(w, http.StatusBadRequest, "use at least 12 characters")
		return
	}
	if _, err := a.Ctl.Login(r.Context(), u.Email, in.Current); err != nil {
		fail(w, http.StatusForbidden, "that is not your current password")
		return
	}
	if err := a.Ctl.ResetPassword(r.Context(), u.Email, in.Password); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.Ctl.SetMustChange(r.Context(), u.ID, false) // a password of their own now
	// ResetPassword drops every session, including this one: hand the browser
	// a fresh cookie so the person stays signed in here.
	token, err := a.Ctl.CreateSession(r.Context(), u.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.setCookie(w, r, token, int((30 * 24 * time.Hour).Seconds()))
	w.WriteHeader(http.StatusNoContent)
}

// siteConfig returns a site's configuration (Settings → General and Privacy).
func (a *API) siteConfig(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	c, err := a.Ctl.SiteConfig(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (a *API) setSiteConfig(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	var in sqlite.SiteConfig
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	// A glob is a path, nothing more: no regular expressions, no surprises.
	clean := in.ExcludePaths[:0]
	for _, p := range in.ExcludePaths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if !strings.HasPrefix(p, "/") {
			fail(w, http.StatusBadRequest, "excluded paths start with /, like /admin/*")
			return
		}
		if len(clean) == 50 {
			fail(w, http.StatusBadRequest, "50 excluded paths is the limit")
			return
		}
		clean = append(clean, p)
	}
	in.ExcludePaths = clean
	if in.RetentionDays != 0 && in.RetentionDays < 7 {
		fail(w, http.StatusBadRequest, "keep data for at least 7 days")
		return
	}
	// A page goal is a name and a path, like a content group.
	for _, g := range in.PageGoals {
		if strings.TrimSpace(g.Name) == "" || !strings.HasPrefix(strings.TrimSpace(g.Path), "/") {
			fail(w, http.StatusBadRequest, "a page goal needs a name and a path that starts with /, like Saw pricing = /pricing")
			return
		}
	}
	if err := a.Ctl.SetSiteConfig(r.Context(), r.PathValue("site"), in); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.cache.purgeSite(r.PathValue("site"))
	a.siteConfig(w, r)
}

// ---- profile ---------------------------------------------------------------

// profile returns the signed-in person's name and whether they have a picture.
func (a *API) profile(w http.ResponseWriter, r *http.Request) {
	u := r.Context().Value(ctxKey{}).(principal).user
	if u == nil {
		fail(w, http.StatusForbidden, "API keys have no profile")
		return
	}
	p, err := a.Ctl.Profile(r.Context(), u.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (a *API) setProfile(w http.ResponseWriter, r *http.Request) {
	u := r.Context().Value(ctxKey{}).(principal).user
	if u == nil {
		fail(w, http.StatusForbidden, "API keys have no profile")
		return
	}
	var in struct {
		Name string `json:"name"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if len([]rune(in.Name)) > 60 {
		fail(w, http.StatusBadRequest, "keep the name under 60 characters")
		return
	}
	if err := a.Ctl.SetName(r.Context(), u.ID, in.Name); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.profile(w, r)
}

// avatarTypes are the picture formats accepted. Kept short on purpose: these
// are what browsers produce from a file picker, and each one is easy to sniff.
var avatarTypes = map[string]string{
	"\x89PNG\r\n\x1a\n": "image/png",
	"\xff\xd8\xff":      "image/jpeg",
	"RIFF":              "image/webp",
	"GIF8":              "image/gif",
}

// putAvatar stores a picture. The body is the image itself, and the type is
// read from its first bytes — never from the request, which anyone can set.
func (a *API) putAvatar(w http.ResponseWriter, r *http.Request) {
	u := r.Context().Value(ctxKey{}).(principal).user
	if u == nil {
		fail(w, http.StatusForbidden, "API keys have no profile")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, sqlite.MaxAvatar+1))
	if err != nil {
		fail(w, http.StatusRequestEntityTooLarge, "that picture is too big (256 KB is the limit)")
		return
	}
	if len(body) > sqlite.MaxAvatar {
		fail(w, http.StatusRequestEntityTooLarge, "that picture is too big (256 KB is the limit)")
		return
	}
	mime := ""
	for magic, t := range avatarTypes {
		if strings.HasPrefix(string(body), magic) {
			mime = t
			break
		}
	}
	if mime == "" {
		fail(w, http.StatusBadRequest, "pictures must be PNG, JPEG, WebP or GIF")
		return
	}
	if err := a.Ctl.SetAvatar(r.Context(), u.ID, mime, body); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) deleteAvatar(w http.ResponseWriter, r *http.Request) {
	u := r.Context().Value(ctxKey{}).(principal).user
	if u == nil {
		fail(w, http.StatusForbidden, "API keys have no profile")
		return
	}
	if err := a.Ctl.SetAvatar(r.Context(), u.ID, "", nil); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// getAvatar serves the picture from this server, so no avatar service ever
// learns an email address or an IP.
func (a *API) getAvatar(w http.ResponseWriter, r *http.Request) {
	u := r.Context().Value(ctxKey{}).(principal).user
	if u == nil {
		http.NotFound(w, r)
		return
	}
	mime, body, err := a.Ctl.Avatar(r.Context(), u.ID)
	if err != nil || len(body) == 0 {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "private, max-age=60")
	w.Write(body)
}

// deletePreview says what deleting a site would remove, before anyone
// decides: the numbers the confirmation shows are the real ones.
func (a *API) deletePreview(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	if !a.siteExists(w, r) {
		return
	}
	out := map[string]int64{}
	if q := a.Query; q != nil && q() != nil {
		var ev, se int64
		q().DB.QueryRowContext(r.Context(), `SELECT count(*) FROM events WHERE site_id = ?`, site).Scan(&ev)
		q().DB.QueryRowContext(r.Context(), `SELECT count(*) FROM sessions WHERE site_id = ?`, site).Scan(&se)
		out["events"], out["sessions"] = ev, se
	}
	for key, query := range map[string]string{
		"payments":    `SELECT count(*) FROM pay_payments WHERE site_id = ?`,
		"connections": `SELECT count(*) FROM pay_connections WHERE site_id = ?`,
		"shares":      `SELECT count(*) FROM site_shares WHERE site_id = ?`,
		"widgets":     `SELECT count(*) FROM widgets WHERE site_id = ?`,
	} {
		var n int64
		a.Ctl.DB.QueryRowContext(r.Context(), query, site).Scan(&n)
		out[key] = n
	}
	writeJSON(w, http.StatusOK, out)
}
