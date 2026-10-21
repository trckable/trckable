package api

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// What a site is built with, read from the homepage the install flow looks
// at: the dashboard opens that tab first. It names a stack only on a plain
// sign (the framework's own asset path, its generator tag); when two stacks
// show on one page (a headless shop, a framework fetching a CMS's images) or
// nothing does, it says nothing, so the dialog never guesses. The ids are the
// dashboard's install methods (dashboard/src/lib/install.ts).

var generatorMeta = regexp.MustCompile(`(?is)<meta\b[^>]*\bname\s*=\s*["']generator["'][^>]*\bcontent\s*=\s*["']([^"']*)["']|<meta\b[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*\bname\s*=\s*["']generator["']`)

// stackMarks are the signs of each stack in the page: any one is enough.
var stackMarks = []struct {
	id    string
	marks []string
}{
	{"next", []string{"/_next/static/", "__next_data__", "id=\"__next\""}},
	{"wordpress", []string{"/wp-content/", "/wp-includes/", "/wp-json/"}},
	{"shopify", []string{"cdn.shopify.com", "shopify.theme", "myshopify.com"}},
	{"webflow", []string{"data-wf-site", "assets.website-files.com", "cdn.prod.website-files.com"}},
	{"framer", []string{"framerusercontent.com", "data-framer-"}},
	{"squarespace", []string{"static1.squarespace.com", "static.squarespace.com"}},
	{"wix", []string{"static.wixstatic.com", "static.parastorage.com"}},
	{"astro", []string{"astro-island", "/_astro/"}},
	{"gatsby", []string{"___gatsby", "/page-data/"}},
	{"docusaurus", []string{"/assets/js/runtime~main", "__docusaurus"}},
	{"ghost", []string{"/ghost/api/", "ghost-portal"}},
	{"bigcommerce", []string{"cdn11.bigcommerce.com"}},
	{"magento", []string{"/static/frontend/magento", "mage/cookies", "magento_"}},
	{"drupal", []string{"/sites/default/files/", "drupal.settings", "/core/misc/drupal.js"}},
	{"joomla", []string{"/media/jui/", "/media/system/js/", "joomla!"}},
	{"prestashop", []string{"/modules/ps_", "prestashop"}},
	{"weebly", []string{"editmysite.com"}},
}

// generatorIDs are the generator tag's names, for the stacks that write one.
var generatorIDs = []struct{ id, prefix string }{
	{"wordpress", "wordpress"}, {"ghost", "ghost"}, {"webflow", "webflow"}, {"framer", "framer"},
	{"squarespace", "squarespace"}, {"wix", "wix"}, {"astro", "astro"}, {"gatsby", "gatsby"},
	{"docusaurus", "docusaurus"}, {"drupal", "drupal"}, {"joomla", "joomla"}, {"prestashop", "prestashop"},
	{"magento", "magento"}, {"shopify", "shopify"}, {"hubspot", "hubspot"}, {"weebly", "weebly"},
}

// stackOf names the one stack the page shows, or "" when it shows none or
// more than one.
func stackOf(page string) string {
	low := strings.ToLower(page)
	found := map[string]bool{}
	for _, s := range stackMarks {
		for _, m := range s.marks {
			if strings.Contains(low, m) {
				found[s.id] = true
				break
			}
		}
	}
	for _, m := range generatorMeta.FindAllStringSubmatch(page, -1) {
		g := strings.ToLower(strings.TrimSpace(m[1] + m[2]))
		for _, id := range generatorIDs {
			if strings.HasPrefix(g, id.prefix) {
				found[id.id] = true
			}
		}
	}
	if len(found) != 1 {
		return ""
	}
	for id := range found {
		return id
	}
	return ""
}

type installStack struct {
	// Stack is the install method that fits the site, or empty when it is not clear.
	Stack string `json:"stack"`
}

// stackSite reads the homepage once and names its stack; empty when the page
// could not be read, answered an error or sits on another host.
func stackSite(parent context.Context, domain string) string {
	ctx, cancel := context.WithTimeout(parent, checkDeadline)
	defer cancel()
	page, final, status, err := fetchText(ctx, checkClient(), "https://"+domain+"/")
	if err != nil || status >= 400 || !sameSite(final.Hostname(), domain) {
		return ""
	}
	return stackOf(page)
}

func (a *API) installStack(w http.ResponseWriter, r *http.Request) {
	if !a.loginRate.allow("stack:"+r.PathValue("site"), a.Now(), 10, 10*time.Minute) {
		fail(w, http.StatusTooManyRequests, "checked many times just now: try again in a few minutes")
		return
	}
	si, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	writeJSON(w, http.StatusOK, installStack{Stack: stackSite(r.Context(), si.Domain)})
}
