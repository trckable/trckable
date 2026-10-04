package api

import (
	"bytes"
	"database/sql"
	"errors"
	"image"
	_ "image/gif" // registers the format for DecodeConfig
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// How a site's share links look to the people who open them: the owner's own
// logo, a colour, "hide trckable branding", and a domain of their own for
// the links. All of it is stored per site and applied on the server: the
// page is told what to draw, and a domain opens nothing but share pages.

// maxLogoPixels bounds a logo's width and height: a small file can still
// describe a picture a browser must allocate gigabytes for.
const maxLogoPixels = 2000

// logoType names the picture in data, with an SVG already cleaned, or fails
// with words for the owner.
func logoType(data []byte) (string, []byte, error) {
	head := bytes.ToLower(data[:min(len(data), 1024)])
	if bytes.Contains(head, []byte("<svg")) {
		clean, err := cleanSVG(data)
		if err != nil {
			return "", nil, err
		}
		if len(clean) > sqlite.MaxShareLogo {
			return "", nil, errors.New("a logo can be up to 128 KB")
		}
		return "image/svg+xml", clean, nil
	}
	typ := http.DetectContentType(data)
	switch typ {
	case "image/png", "image/jpeg", "image/gif":
	default:
		return "", nil, errors.New("use a PNG, JPEG, GIF or SVG logo")
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width < 1 || cfg.Height < 1 {
		return "", nil, errors.New("that picture could not be read")
	}
	if cfg.Width > maxLogoPixels || cfg.Height > maxLogoPixels {
		return "", nil, errors.New("a logo can be up to 2000 by 2000 pixels")
	}
	return typ, data, nil
}

// shareLookAnswer is a site's look as its owner edits it: the settings, where
// the logo is, and the address a domain is to be pointed at.
func (a *API) shareLookAnswer(w http.ResponseWriter, r *http.Request, site string) {
	l := a.Ctl.ShareLookOf(r.Context(), site)
	logo := ""
	if l.LogoAt > 0 {
		logo = "/api/v1/sites/" + site + "/share-logo?v=" + strconv.FormatInt(l.LogoAt, 10)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"color": l.Color, "hide_brand": l.HideBrand, "domain": l.Domain, "logo_url": logo,
		"target": hostOnly(a.publicBase(r)), // what the domain's CNAME points at
	})
}

func (a *API) shareLook(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	a.shareLookAnswer(w, r, r.PathValue("site"))
}

func (a *API) setShareLook(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	var in struct {
		Color     string `json:"color"`
		HideBrand bool   `json:"hide_brand"`
		Domain    string `json:"domain"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	domain, err := sqlite.ShareDomain(in.Domain)
	if err == nil && domain != "" && (domain == hostOnly(a.publicBase(r)) || domain == hostOnly(r.Host)) {
		err = errors.New("that is the address of this dashboard: use another domain for share links")
	}
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	site := r.PathValue("site")
	if err := a.Ctl.SetShareLook(r.Context(), site, strings.TrimSpace(in.Color), in.HideBrand, domain); err != nil {
		if busy(w, err) {
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.loadShareHosts(r)
	a.shareLookAnswer(w, r, site)
}

func (a *API) setShareLogo(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, sqlite.MaxShareLogo+1))
	if err != nil || len(data) > sqlite.MaxShareLogo {
		fail(w, http.StatusRequestEntityTooLarge, "a logo can be up to 128 KB")
		return
	}
	typ, clean, err := logoType(data)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	site := r.PathValue("site")
	if err := a.Ctl.SetShareLogo(r.Context(), site, typ, clean); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.shareLookAnswer(w, r, site)
}

func (a *API) clearShareLogo(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	site := r.PathValue("site")
	if err := a.Ctl.ClearShareLogo(r.Context(), site); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.shareLookAnswer(w, r, site)
}

// sendLogo writes a logo as a picture and nothing else: the policy allows no
// script, no loading and no framing, and the sandbox applies even when the
// address is opened on its own, so a file that slipped past the cleaning
// still could not run.
func sendLogo(w http.ResponseWriter, typ string, data []byte) {
	h := w.Header()
	h.Set("Content-Type", typ)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
	// The address carries ?v=<when it changed>, so the browser may keep it.
	h.Set("Cache-Control", "private, max-age=31536000, immutable")
	_, _ = w.Write(data)
}

// shareLogoOwner is the logo for the owner's own settings.
func (a *API) shareLogoOwner(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	typ, data, err := a.Ctl.ShareLogo(r.Context(), r.PathValue("site"))
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, http.StatusNotFound, "this site has no logo")
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	sendLogo(w, typ, data)
}

// shareLogo is the logo on a shared page. It needs the link's session like
// every other answer on this side.
func (a *API) shareLogo(w http.ResponseWriter, r *http.Request) {
	sh, ok := a.shared(w, r)
	if !ok {
		return
	}
	typ, data, err := a.Ctl.ShareLogo(r.Context(), sh.SiteID)
	if err != nil {
		fail(w, http.StatusNotFound, "this site has no logo")
		return
	}
	sendLogo(w, typ, data)
}

// shareLogoURL is where a shared page loads the logo from: this server, with
// the link's own session.
func shareLogoURL(l sqlite.ShareLook) string {
	if l.LogoAt == 0 {
		return ""
	}
	return sharePath + "/logo?v=" + strconv.FormatInt(l.LogoAt, 10)
}

// ---- the domain ------------------------------------------------------------

// hostOnly is a host without its port, or an address's host.
func hostOnly(s string) string {
	if u, err := url.Parse(s); err == nil && u.Host != "" {
		s = u.Host
	}
	if h, _, err := net.SplitHostPort(s); err == nil {
		return strings.ToLower(h)
	}
	return strings.ToLower(s)
}

// loadShareHosts reads the share domains into memory, so a request on the
// ingest path costs one map lookup and no query.
func (a *API) loadShareHosts(r *http.Request) {
	m, err := a.Ctl.ShareDomains(r.Context())
	if err != nil {
		return // the last list stays
	}
	a.shareHosts.Store(&m)
}

// shareDomainSite is the site whose share links a Host opens, when the host
// is a share domain.
func (a *API) shareDomainSite(r *http.Request) (string, bool) {
	m := a.shareHosts.Load()
	if m == nil {
		a.loadShareHosts(r)
		if m = a.shareHosts.Load(); m == nil {
			return "", false
		}
	}
	site, ok := (*m)[hostOnly(r.Host)]
	return site, ok
}

// shareBase is where a site's share links are opened: its own domain when it
// has one (the proxy in front provides the https), else this server's
// address.
func (a *API) shareBase(r *http.Request, site string) string {
	if d := a.Ctl.ShareLookOf(r.Context(), site).Domain; d != "" {
		return "https://" + d
	}
	return a.publicBase(r)
}

// onShareDomain keeps a share domain to share pages. Asked for its own
// address, a share domain answers the page of a link of its site, that
// page's API and files, and nothing else: no sign-in, no dashboard, no
// tracker. Every other host is left as it was.
func (a *API) onShareDomain(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		site, ok := a.shareDomainSite(r)
		if !ok {
			next.ServeHTTP(w, r)
			return
		}
		p := r.URL.Path
		allowed := false
		switch {
		case p == "/s" || strings.HasPrefix(p, "/s/"):
			token := shareToken(p)
			allowed = token != "" && a.Ctl.ShareSiteForToken(r.Context(), token) == site
		case strings.HasPrefix(p, "/api/v1/share/"), strings.HasPrefix(p, "/assets/"), strings.HasPrefix(p, "/icons/"),
			p == "/theme.js", p == "/favicon.svg", p == "/manifest.webmanifest":
			allowed = true
		}
		if !allowed {
			http.NotFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ShareDomains wraps the whole server's handler (server.go).
func (a *API) ShareDomains(next http.Handler) http.Handler {
	a.init()
	return a.onShareDomain(next)
}

// shareDomainAsk answers a proxy that asks before it gets a certificate for
// a name (Caddy's on_demand_tls "ask"): 200 for a domain a site uses for its
// share links, 404 for any other. It says nothing more.
func (a *API) shareDomainAsk(w http.ResponseWriter, r *http.Request) {
	d, err := sqlite.ShareDomain(r.URL.Query().Get("domain"))
	if err != nil || d == "" {
		http.NotFound(w, r)
		return
	}
	m := a.shareHosts.Load()
	if m == nil {
		a.loadShareHosts(r)
		m = a.shareHosts.Load()
	}
	if m == nil {
		http.NotFound(w, r)
		return
	}
	if _, ok := (*m)[d]; !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
}
