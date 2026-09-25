package api

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A site's look in the dashboard: an accent colour and a small icon. The icon
// is an image the owner uploads, or the site's own favicon, fetched once by
// this server (never by visitors) through the same guard alerts use, so it
// cannot be pointed at this machine or its private network.

// iconType names the image in data, or "" when it is not one we keep. SVG is
// left out on purpose: it can carry script.
func iconType(data []byte) string {
	switch t := http.DetectContentType(data); t {
	case "image/png", "image/jpeg", "image/webp", "image/gif", "image/x-icon", "image/vnd.microsoft.icon":
		return t
	}
	return ""
}

func (a *API) siteIcon(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	typ, data, err := a.Ctl.BrandIcon(r.Context(), r.PathValue("site"))
	if errors.Is(err, sql.ErrNoRows) {
		fail(w, http.StatusNotFound, "this site has no icon")
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", typ)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// The URL carries ?v=<when it changed>, so it can be kept a long time.
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Write(data)
}

func (a *API) setSiteIcon(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, sqlite.MaxIcon+1))
	if err != nil || len(data) > sqlite.MaxIcon {
		fail(w, http.StatusRequestEntityTooLarge, "an icon can be up to 64 KB")
		return
	}
	a.storeIcon(w, r, data)
}

// storeIcon keeps an image as a site's icon and answers with the site's brand.
func (a *API) storeIcon(w http.ResponseWriter, r *http.Request, data []byte) {
	typ := iconType(data)
	if typ == "" {
		fail(w, http.StatusBadRequest, "use a PNG, JPEG, WebP, GIF or ICO picture")
		return
	}
	if err := a.Ctl.SetBrandIcon(r.Context(), r.PathValue("site"), typ, data); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.writeBrand(w, r)
}

// fetchFavicon asks the site for its own icon: the Apple touch icon first
// (usually larger and sharper), then /favicon.ico.
func (a *API) fetchFavicon(w http.ResponseWriter, r *http.Request) {
	// Each of these does real work (outside fetches, or a password hash):
	// limited, so a busy button or a stolen session cannot make it a flood.
	if !a.loginRate.allow("favicon:"+r.PathValue("site"), a.Now(), 10, 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "tried many times just now: try again in a few minutes")
		return
	}
	if !a.siteExists(w, r) {
		return
	}
	si, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	client := alerts.SafeClient(6 * time.Second)
	home := "https://" + si.Domain + "/"
	// The icons the homepage names come first (most sites point at a PNG
	// there), then the two places browsers look by themselves.
	named, reached := declaredIcons(r.Context(), client, home)
	if !reached {
		fail(w, http.StatusNotFound, si.Domain+" could not be reached over https, so its favicon cannot be fetched. Upload a picture instead.")
		return
	}
	tries := append(named, home+"apple-touch-icon.png", home+"favicon.ico")
	for _, u := range tries {
		if data, ok := getIcon(r.Context(), client, u); ok {
			a.storeIcon(w, r, data)
			return
		}
	}
	fail(w, http.StatusNotFound, si.Domain+" has no icon trckable can use: none of the ones its homepage names, /apple-touch-icon.png or /favicon.ico is a PNG, JPEG, WebP, GIF or ICO (SVG icons are not kept). Upload a picture instead.")
}

var iconLink = regexp.MustCompile(`(?is)<link\b[^>]*>`)
var linkAttr = regexp.MustCompile(`(?is)\b(rel|href)\s*=\s*["']([^"']*)["']`)

// declaredIcons reads the homepage's <link rel="icon" …> tags and returns the
// icons it names, as absolute URLs: an embedded one (data:) and SVG are left
// out, since SVG can carry script and is not kept. reached is false when the
// site did not answer at all.
func declaredIcons(ctx context.Context, client *http.Client, home string) (icons []string, reached bool) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, home, nil)
	if err != nil {
		return nil, false
	}
	req.Header.Set("User-Agent", "trckable (site icon)")
	res, err := client.Do(req)
	if err != nil {
		return nil, false
	}
	defer res.Body.Close()
	page, _ := io.ReadAll(io.LimitReader(res.Body, 256<<10))
	return iconLinks(page, home), true
}

// iconLinks finds up to three icons a page names, as absolute https URLs.
func iconLinks(page []byte, home string) []string {
	base, err := url.Parse(home)
	if err != nil {
		return nil
	}
	var out []string
	for _, tag := range iconLink.FindAll(page, 40) {
		var rel, href string
		for _, m := range linkAttr.FindAllSubmatch(tag, -1) {
			switch strings.ToLower(string(m[1])) {
			case "rel":
				rel = strings.ToLower(string(m[2]))
			case "href":
				href = strings.TrimSpace(string(m[2]))
			}
		}
		if !strings.Contains(rel, "icon") || href == "" || strings.HasPrefix(href, "data:") || strings.Contains(strings.ToLower(href), ".svg") {
			continue
		}
		if u, err := base.Parse(href); err == nil && u.Scheme == "https" {
			out = append(out, u.String())
		}
		if len(out) == 3 {
			break
		}
	}
	return out
}

func getIcon(ctx context.Context, client *http.Client, url string) ([]byte, bool) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, false
	}
	req.Header.Set("User-Agent", "trckable (site icon)")
	res, err := client.Do(req)
	if err != nil {
		return nil, false
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, false
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, sqlite.MaxIcon+1))
	if err != nil || len(data) == 0 || len(data) > sqlite.MaxIcon || iconType(data) == "" {
		return nil, false
	}
	return data, true
}

func (a *API) clearSiteIcon(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	if err := a.Ctl.ClearBrandIcon(r.Context(), r.PathValue("site")); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.writeBrand(w, r)
}

func (a *API) setSiteColor(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	var in struct {
		Color string `json:"color"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := a.Ctl.SetBrandColor(r.Context(), r.PathValue("site"), strings.TrimSpace(in.Color)); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.writeBrand(w, r)
}

func (a *API) writeBrand(w http.ResponseWriter, r *http.Request) {
	brands, _ := a.Ctl.Brands(r.Context(), principalOf(r).account)
	b := brands[r.PathValue("site")]
	writeJSON(w, http.StatusOK, map[string]any{"color": b.Color, "icon_at": b.IconAt, "icon_url": iconURL(r.PathValue("site"), b)})
}

func iconURL(site string, b sqlite.Brand) string {
	if b.IconAt == 0 {
		return ""
	}
	return "/api/v1/sites/" + site + "/icon?v=" + strconv.FormatInt(b.IconAt, 10)
}
