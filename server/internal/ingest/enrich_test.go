package ingest

import "testing"

func TestClassify(t *testing.T) {
	cases := []struct {
		name, page, ref, want string
	}{
		{"direct", "https://site.com/", "", ChannelDirect},
		{"google", "https://site.com/", "https://www.google.com/", ChannelSearch},
		{"google ccTLD", "https://site.com/", "https://www.google.de/search?q=x", ChannelSearch},
		{"bing", "https://site.com/", "https://bing.com/", ChannelSearch},
		{"duckduckgo", "https://site.com/", "https://duckduckgo.com/", ChannelSearch},
		{"chatgpt", "https://site.com/", "https://chatgpt.com/", ChannelAI},
		{"perplexity", "https://site.com/", "https://www.perplexity.ai/search/abc", ChannelAI},
		{"claude", "https://site.com/", "https://claude.ai/chat/1", ChannelAI},
		{"gemini beats google search", "https://site.com/", "https://gemini.google.com/app", ChannelAI},
		{"chatgpt utm", "https://site.com/?utm_source=chatgpt.com", "", ChannelAI},
		{"x via t.co", "https://site.com/", "https://t.co/abc", ChannelSocial},
		{"hacker news", "https://site.com/", "https://news.ycombinator.com/item?id=1", ChannelSocial},
		{"reddit", "https://site.com/", "https://old.reddit.com/r/selfhosted", ChannelSocial},
		{"gmail", "https://site.com/", "https://mail.google.com/", ChannelEmail},
		{"newsletter utm", "https://site.com/?utm_medium=email&utm_source=weekly", "", ChannelEmail},
		{"gclid is paid", "https://site.com/?gclid=abc", "https://www.google.com/", ChannelPaid},
		{"cpc is paid", "https://site.com/?utm_medium=cpc&utm_source=google", "", ChannelPaid},
		{"fbclid is paid", "https://site.com/?fbclid=x", "https://l.facebook.com/", ChannelPaid},
		{"other site", "https://site.com/", "https://someblog.dev/post", ChannelReferral},
		{"ref param", "https://site.com/?ref=producthunt", "", ChannelReferral},
		{"self referral is direct", "https://site.com/b", "https://site.com/a", ChannelDirect},
		{"own subdomain is direct", "https://app.site.com/", "https://site.com/", ChannelDirect},
		{"stripe checkout return is direct", "https://site.com/thanks", "https://checkout.stripe.com/c/pay/x", ChannelDirect},
		{"lemonsqueezy return is direct", "https://site.com/thanks", "https://acme.lemonsqueezy.com/checkout", ChannelDirect},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p, ok := parsePageURL(c.page, false)
			if !ok {
				t.Fatal("bad page url")
			}
			host, clean := parseReferrer(c.ref, p.Host)
			if got := classify(p, host, clean); got != c.want {
				t.Fatalf("classify(%s, %s) = %s, want %s", c.page, c.ref, got, c.want)
			}
		})
	}
}

func TestParsePageURLStripsPrivateQuery(t *testing.T) {
	p, ok := parsePageURL("https://www.Site.com/pricing/?email=a@b.com&token=secret&utm_source=x&utm_campaign=Launch", false)
	if !ok {
		t.Fatal("parse failed")
	}
	if p.Host != "site.com" || p.Path != "/pricing" {
		t.Fatalf("host/path = %s %s", p.Host, p.Path)
	}
	if p.UTMSource != "x" || p.UTMCampaign != "Launch" {
		t.Fatalf("utm = %+v", p)
	}
}

func TestHashMode(t *testing.T) {
	p, _ := parsePageURL("https://site.com/app#/settings", true)
	if p.Path != "/app/#/settings" {
		t.Fatalf("hash path = %q", p.Path)
	}
	p, _ = parsePageURL("https://site.com/app#/settings", false)
	if p.Path != "/app" {
		t.Fatalf("non-hash path = %q", p.Path)
	}
}

func TestReferrerIsPrivacySafe(t *testing.T) {
	host, clean := parseReferrer("https://someblog.dev/post/?session=abc#x", "site.com")
	if host != "someblog.dev" || clean != "someblog.dev/post" {
		t.Fatalf("got %q %q", host, clean)
	}
}
