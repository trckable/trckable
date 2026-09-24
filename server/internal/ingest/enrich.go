package ingest

import (
	"net/url"
	"strings"
)

// Channels, in classification priority order (plan §5.5).
const (
	ChannelPaid     = "Paid"
	ChannelEmail    = "Email"
	ChannelAI       = "AI"
	ChannelSearch   = "Search"
	ChannelSocial   = "Social"
	ChannelReferral = "Referral"
	ChannelDirect   = "Direct"
)

// Query parameters kept on stored URLs; everything else is stripped for privacy.
var keptParams = map[string]bool{
	"utm_source": true, "utm_medium": true, "utm_campaign": true, "utm_term": true, "utm_content": true,
	"ref": true, "via": true, "source": true,
}

// Ad click ids mark a visit as Paid.
var clickIDs = []string{"gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid", "twclid", "li_fat_id", "dclid"}

// Checkout hosts are never counted as referrers: returning from a payment page
// is the same visit, not a new "referral" (plan §5.5).
var checkoutHosts = []string{
	"checkout.stripe.com", "buy.stripe.com", "billing.stripe.com", "pay.stripe.com",
	"lemonsqueezy.com", "polar.sh", "paddle.com", "dodopayments.com", "paypal.com",
}

var aiHosts = []string{
	"chatgpt.com", "chat.openai.com", "openai.com", "perplexity.ai", "claude.ai", "gemini.google.com",
	"bard.google.com", "copilot.microsoft.com", "bing.com/chat", "you.com", "phind.com", "poe.com",
	"chat.deepseek.com", "deepseek.com", "grok.com", "meta.ai", "chat.mistral.ai", "kagi.com/assistant",
}

var searchHosts = []string{
	"google.", "bing.com", "duckduckgo.com", "search.yahoo.", "yahoo.com", "ecosia.org", "baidu.com",
	"yandex.", "search.brave.com", "startpage.com", "qwant.com", "naver.com", "seznam.cz", "kagi.com",
}

var socialHosts = []string{
	"x.com", "t.co", "twitter.com", "facebook.com", "fb.com", "l.facebook.com", "lm.facebook.com",
	"instagram.com", "l.instagram.com", "linkedin.com", "lnkd.in", "reddit.com", "old.reddit.com",
	"youtube.com", "youtu.be", "tiktok.com", "pinterest.", "threads.net", "threads.com", "bsky.app",
	"mastodon.", "news.ycombinator.com", "producthunt.com", "discord.com", "t.me", "telegram.org",
	"whatsapp.com", "snapchat.com", "quora.com", "medium.com", "substack.com", "indiehackers.com",
	"dev.to", "github.com", "tumblr.com", "vk.com", "weibo.com",
}

var emailHosts = []string{
	"mail.google.com", "outlook.live.com", "outlook.office.com", "mail.yahoo.com", "mail.proton.me",
	"app.fastmail.com", "mail.zoho.com", "mail.aol.com",
}

// parsedURL is the privacy-safe, analytics-relevant part of a page URL.
type parsedURL struct {
	Secure                        bool // page served over https
	Host, Path                    string
	UTMSource, UTMMedium          string
	UTMCampaign, UTMTerm, UTMCont string
	Ref                           string // ref / via / source param
	Paid                          bool   // an ad click id was present
}

func parsePageURL(raw string, hashMode bool) (parsedURL, bool) {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return parsedURL{}, false
	}
	var p parsedURL
	p.Secure = u.Scheme == "https"
	p.Host = strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	p.Path = u.EscapedPath()
	if p.Path == "" {
		p.Path = "/"
	}
	if hashMode && u.Fragment != "" {
		p.Path = strings.TrimSuffix(p.Path, "/") + "/#" + u.Fragment
	}
	if len(p.Path) > 1 {
		p.Path = strings.TrimSuffix(p.Path, "/")
	}
	q := u.Query()
	p.UTMSource = clip(q.Get("utm_source"), 128)
	p.UTMMedium = clip(strings.ToLower(q.Get("utm_medium")), 128)
	p.UTMCampaign = clip(q.Get("utm_campaign"), 128)
	p.UTMTerm = clip(q.Get("utm_term"), 128)
	p.UTMCont = clip(q.Get("utm_content"), 128)
	for _, k := range []string{"ref", "via", "source"} {
		if v := q.Get(k); v != "" {
			p.Ref = clip(v, 128)
			break
		}
	}
	for _, k := range clickIDs {
		if q.Has(k) {
			p.Paid = true
			break
		}
	}
	return p, true
}

// referrer returns the normalized referrer host and a privacy-safe URL
// (scheme+host+path, no query). Empty when there is no external referrer.
func parseReferrer(raw, pageHost string) (host, clean string) {
	if raw == "" {
		return "", ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "", ""
	}
	host = strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	if host == pageHost || strings.HasSuffix(host, "."+pageHost) || strings.HasSuffix(pageHost, "."+host) {
		return "", "" // internal navigation / own subdomain
	}
	for _, c := range checkoutHosts {
		if host == c || strings.HasSuffix(host, "."+c) {
			return "", ""
		}
	}
	clean = host + u.EscapedPath()
	if len(clean) > 1 && strings.HasSuffix(clean, "/") {
		clean = strings.TrimSuffix(clean, "/")
	}
	return host, clip(clean, 512)
}

// classify assigns the marketing channel, in priority order.
func classify(p parsedURL, refHost, refURL string) string {
	med := p.UTMMedium
	src := strings.ToLower(p.UTMSource)
	switch {
	case p.Paid, med == "cpc", med == "ppc", med == "paid", med == "paidsocial", med == "paid_social",
		med == "display", med == "cpm", med == "banner", strings.HasPrefix(med, "paid"):
		return ChannelPaid
	case med == "email", med == "e-mail", med == "newsletter", src == "newsletter", matchHost(refHost, emailHosts),
		strings.Contains(refHost, "mail."):
		return ChannelEmail
	case matchHost(refHost, aiHosts) || matchURL(refURL, aiHosts) || isAISource(src):
		return ChannelAI
	case matchHost(refHost, searchHosts), med == "organic":
		return ChannelSearch
	case matchHost(refHost, socialHosts), med == "social", isSocialSource(src):
		return ChannelSocial
	case refHost != "", p.UTMSource != "", p.Ref != "":
		return ChannelReferral
	default:
		return ChannelDirect
	}
}

func isAISource(src string) bool {
	switch src {
	case "chatgpt", "chatgpt.com", "openai", "perplexity", "claude", "gemini", "copilot", "deepseek", "grok":
		return true
	}
	return false
}

func isSocialSource(src string) bool {
	switch src {
	case "twitter", "x", "facebook", "fb", "instagram", "ig", "linkedin", "reddit", "youtube", "tiktok",
		"threads", "bluesky", "mastodon", "hackernews", "hn", "producthunt":
		return true
	}
	return false
}

// matchHost: entries ending in "." match any TLD (google. → google.de);
// others match exactly or as a parent domain.
func matchHost(host string, list []string) bool {
	if host == "" {
		return false
	}
	for _, h := range list {
		if strings.Contains(h, "/") {
			continue
		}
		if strings.HasSuffix(h, ".") {
			if strings.HasPrefix(host, h) || strings.Contains(host, "."+h) {
				return true
			}
			continue
		}
		if host == h || strings.HasSuffix(host, "."+h) {
			return true
		}
	}
	return false
}

func matchURL(u string, list []string) bool {
	for _, h := range list {
		if strings.Contains(h, "/") && strings.HasPrefix(u, h) {
			return true
		}
	}
	return false
}

func clip(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
