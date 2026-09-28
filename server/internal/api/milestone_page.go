package api

import (
	"errors"
	"html/template"
	"net/http"
	"strings"
	"sync"

	"github.com/trckable/trckable/server/internal/milestones"
)

// The public side of a milestone link: /m/{token} is a tiny page with the
// card as its preview image, and /m/{token}.png the card. The token opens
// one milestone of one site and nothing else: no report, no other
// milestone, no visitor data. A revoked link, a deleted site, a suspended
// account or milestones turned off answer 404, and a money milestone shows
// its amount only when its owner turned that on for the link and revenue is
// still on.

var milestonePage = template.Must(template.New("m").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{.Title}}</title>
<meta property="og:title" content="{{.Title}}">
<meta property="og:description" content="{{.Reached}}">
<meta property="og:image" content="{{.Image}}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{{.Image}}">
<style>
:root{color-scheme:dark light;--bg:#0b0d10;--fg:#f5f7fa;--muted:#8b95a3;--accent:#b8ff3c}
@media (prefers-color-scheme:light){:root{--bg:#fafaf7;--fg:#0b0d10;--muted:#5c6470;--accent:#487f00}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.5 Geist,ui-sans-serif,system-ui,sans-serif}
main{width:min(720px,100% - 32px);display:grid;gap:14px;padding:24px 0}
img{width:100%;height:auto;border-radius:14px;border:1px solid color-mix(in srgb,var(--muted) 30%,transparent)}
h1{margin:0;font-size:20px}p{margin:0;color:var(--muted)}a{color:var(--accent)}
</style></head>
<body><main>
<img src="{{.Image}}" width="1200" height="630" alt="{{.Title}}">
<h1>{{.Title}}</h1>
<p>{{.Reached}}</p>
<p><a href="https://trckable.com" rel="noopener">{{.Made}}</a></p>
</main></body></html>`))

func (a *API) milestoneLink(w http.ResponseWriter, r *http.Request) {
	token, png := strings.CutSuffix(r.PathValue("token"), ".png")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Robots-Tag", "noindex")
	m, err := a.Ctl.MilestoneByToken(r.Context(), token)
	// A money milestone with revenue turned off since is gone with it.
	if err == nil && milestones.Money(m.Kind) && !a.moduleOn(r, m.SiteID, "revenue") {
		err = errNoLink
	}
	if err != nil {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("This link is not active.\n"))
		return
	}
	if png {
		// Previews fetch the image once and keep it; a short cache is enough.
		a.serveCard(w, m.Milestone, m.Domain, "dark", m.Amount, false, "public, max-age=300")
		return
	}
	words := milestones.Say(m.Milestone, m.Amount)
	d := milestones.PageWords(words, m.Domain)
	d.Image = a.publicBase(r) + "/m/" + token + ".png"
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
	_ = milestonePage.Execute(w, d)
}

var errNoLink = errors.New("no link")

// cardCache keeps drawn PNGs: a card is the same bytes until its words change.
type cardCache struct {
	mu sync.Mutex
	m  map[string][]byte
}

var pngCache = &cardCache{m: map[string][]byte{}}

func (c *cardCache) get(key string, draw func() ([]byte, error)) ([]byte, error) {
	c.mu.Lock()
	b, ok := c.m[key]
	c.mu.Unlock()
	if ok {
		return b, nil
	}
	b, err := draw()
	if err != nil {
		return nil, err
	}
	c.mu.Lock()
	if len(c.m) >= 128 {
		clear(c.m)
	}
	c.m[key] = b
	c.mu.Unlock()
	return b, nil
}
