package api

import (
	"net/url"
	"regexp"
	"strings"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// What kind of site this is, guessed from the homepage the install check has
// already read: no crawling, no extra request. The rules are small on purpose
// and all here; sitekind_test.go has one fixture per rule.
//
//	shop     a cart or checkout link, Shopify or WooCommerce markers, or a
//	         payment provider's script or link (Stripe, Paddle, Lemon Squeezy,
//	         Polar, Gumroad) — unless the page also reads as a SaaS (a pricing
//	         page, a trial button, a sign-up or log-in link) and the provider
//	         is all that points at selling: a SaaS embeds Stripe too
//	saas     a pricing link, a "start free trial" button, a sign-up or log-in link
//	content  an RSS or Atom feed, Article markup or a blog path
//	other    none of these
//
// The first match in that order wins, and the provider seen is reported
// whatever the kind, so the Payments step can say "Connect Stripe".

var hrefOf = regexp.MustCompile(`(?is)\bhref\s*=\s*["']([^"']+)["']`)

var (
	shopMarkers = []string{"cdn.shopify.com", "myshopify.com", "shopify.theme", "woocommerce", "wc-ajax"}
	trialText   = regexp.MustCompile(`(?i)start (your |a )?(14[- ]day |7[- ]day |30[- ]day )?free trial|try (it )?for free|get started for free`)
	feedLink    = regexp.MustCompile(`(?is)<link\b[^>]*type\s*=\s*["']application/(rss|atom)\+xml["']`)
	articleMark = regexp.MustCompile(`(?i)"@type"\s*:\s*"(article|blogposting|newsarticle)"|itemtype\s*=\s*["']https?://schema\.org/(article|blogposting|newsarticle)|<article\b`)
)

// providerMarks are the payment providers a page can carry, by the address
// their script or link goes to.
var providerMarks = []struct{ name, mark string }{
	{"stripe", "js.stripe.com"}, {"stripe", "buy.stripe.com"}, {"stripe", "checkout.stripe.com"},
	{"paddle", "cdn.paddle.com"}, {"paddle", "paddle.com/checkout"}, {"paddle", "buy.paddle.com"},
	{"lemonsqueezy", "lemonsqueezy.com"}, {"lemonsqueezy", "lmsqueezy.com"},
	{"polar", "polar.sh"},
	{"gumroad", "gumroad.com"},
}

// segments are the first two path segments of a link, lowercased, so
// /en/pricing counts as pricing.
func segments(href string) []string {
	u, err := url.Parse(strings.TrimSpace(href))
	if err != nil {
		return nil
	}
	var out []string
	for _, s := range strings.Split(strings.ToLower(u.Path), "/") {
		if s != "" {
			out = append(out, s)
		}
		if len(out) == 2 {
			break
		}
	}
	return out
}

func hasSegment(links [][]string, names ...string) bool {
	for _, segs := range links {
		for _, s := range segs {
			for _, n := range names {
				if s == n || strings.HasPrefix(s, n+".") {
					return true
				}
			}
		}
	}
	return false
}

// guessKind reads a homepage and says what kind of site it is, and which
// payment provider it carries ("" if none).
func guessKind(page string) (kind, provider string) {
	low := strings.ToLower(page)
	var links [][]string
	for _, m := range hrefOf.FindAllStringSubmatch(page, -1) {
		links = append(links, segments(m[1]))
	}
	for _, p := range providerMarks {
		if strings.Contains(low, p.mark) {
			provider = p.name
			break
		}
	}
	strongShop := hasSegment(links, "cart", "checkout", "basket")
	for _, m := range shopMarkers {
		if strings.Contains(low, m) {
			strongShop = true
		}
	}
	saas := hasSegment(links, "pricing", "signup", "sign-up", "register", "login", "log-in", "signin", "sign-in") || trialText.MatchString(page)
	switch {
	case strongShop:
		return sqlite.KindShop, provider
	case saas:
		return sqlite.KindSaaS, provider
	case provider != "":
		return sqlite.KindShop, provider
	case feedLink.MatchString(page) || articleMark.MatchString(page) || hasSegment(links, "blog", "posts", "articles", "news"):
		return sqlite.KindContent, provider
	}
	return sqlite.KindOther, provider
}
