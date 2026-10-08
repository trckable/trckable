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
		{"ref producthunt is social", "https://site.com/?ref=producthunt", "", ChannelSocial},
		{"utm_source producthunt is social", "https://site.com/?utm_source=producthunt", "", ChannelSocial},
		{"ref unknown name is referral", "https://site.com/?ref=friend", "", ChannelReferral},
		{"google accounts is referral", "https://site.com/", "https://accounts.google.com/signin", ChannelReferral},
		{"google docs is referral", "https://site.com/", "https://docs.google.com/document/d/1", ChannelReferral},
		{"google sites is referral", "https://site.com/", "https://sites.google.com/view/x", ChannelReferral},
		{"google bare host", "https://site.com/", "https://google.com/", ChannelSearch},
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

// A hash can carry a secret: an OAuth answer, a magic-link token, an email.
// None of it reaches the stored path; the route does.
func TestHashModeDropsWhatIsNotARoute(t *testing.T) {
	cases := []struct{ page, want string }{
		{"https://site.com/app#/settings", "/app/#/settings"},
		{"https://site.com/app#!/settings/billing", "/app/#!/settings/billing"},
		{"https://site.com/app#/orders/4821", "/app/#/orders/4821"},
		{"https://site.com/app#/search?q=ann@example.com&token=abc", "/app/#/search"},
		{"https://site.com/app#/callback#access_token=abc123", "/app/#/callback"},
		{"https://site.com/app#access_token=abc123&state=x", "/app"},
		{"https://site.com/app#email=ann@example.com", "/app"},
		{"https://site.com/app#/user/ann@example.com", "/app"},
		{"https://site.com/app#/user/ann%40example.com/edit", "/app"},
		{"https://site.com/app#/reset/9f8a7b6c5d4e3f2a1b0c9d8e", "/app/#/reset/:redacted"},
		{"https://site.com/app#/auth/eyJhbGciOi.eyJzdWIiOiIx.c2ln", "/app/#/auth/:redacted"},
		{"https://site.com/app#pricing", "/app/#pricing"},
		{"https://site.com/app#/blog/how-to-use-trckable-2026-edition", "/app/#/blog/how-to-use-trckable-2026-edition"},
		{"https://site.com/app#/internationalization-and-localization-settings", "/app/#/internationalization-and-localization-settings"},
		{"https://site.com/app#/reset/abc+def123ghi456jkl789mno", "/app/#/reset/:redacted"},
		{"https://site.com/app#/invite/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef", "/app/#/invite/:redacted"},
		{"https://site.com/app#/verify/12345678901234567890123", "/app/#/verify/:redacted"},
		{"https://site.com/app#/verify/code:9f8a7b6c5d4e3f2a1b0c", "/app/#/verify/:redacted"},
		{"https://site.com/app#/call/+491701234567", "/app/#/call/:redacted"},
		{"https://site.com/app#/o/123e4567-e89b-12d3-a456-426614174000", "/app/#/o/:redacted"},
		{"https://site.com/app#", "/app"},
	}
	for _, c := range cases {
		p, ok := parsePageURL(c.page, true)
		if !ok || p.Path != c.want {
			t.Errorf("%s -> %q, want %q", c.page, p.Path, c.want)
		}
	}
	// Off: the fragment never reaches the path at all.
	if p, _ := parsePageURL("https://site.com/app#/x?token=abc", false); p.Path != "/app" {
		t.Fatalf("hash mode off: %q", p.Path)
	}
}

func TestSocialTagSharesTheReferrerRow(t *testing.T) {
	tagged, _ := parsePageURL("https://site.com/?ref=producthunt", false)
	if got := socialRefHost(tagged); got != "producthunt.com" {
		t.Fatalf("ref=producthunt host = %q", got)
	}
	host, _ := parseReferrer("https://www.producthunt.com/posts/x", "site.com")
	if host != "producthunt.com" {
		t.Fatalf("referrer host = %q", host)
	}
	other, _ := parsePageURL("https://site.com/?ref=friend", false)
	if got := socialRefHost(other); got != "" {
		t.Fatalf("unknown ref host = %q", got)
	}
}
