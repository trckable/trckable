package api

import "testing"

func TestGuessKind(t *testing.T) {
	for _, tc := range []struct {
		name, page, kind, provider string
	}{
		{"cart link", `<a href="/cart">Cart</a>`, "shop", ""},
		{"checkout link, locale prefix", `<a href="/en/checkout">Pay</a>`, "shop", ""},
		{"shopify", `<script src="https://cdn.shopify.com/s/files/x.js"></script>`, "shop", ""},
		{"woocommerce", `<body class="woocommerce-page"></body>`, "shop", ""},
		{"stripe script", `<script src="https://js.stripe.com/v3/"></script>`, "shop", "stripe"},
		{"paddle script", `<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>`, "shop", "paddle"},
		{"lemon squeezy link", `<a href="https://shop.lemonsqueezy.com/buy/x">Buy</a>`, "shop", "lemonsqueezy"},
		{"polar link", `<a href="https://buy.polar.sh/abc">Buy</a>`, "shop", "polar"},
		{"gumroad link", `<a href="https://gumroad.com/l/book">Buy</a>`, "shop", "gumroad"},
		{"pricing link", `<a href="/pricing">Pricing</a>`, "saas", ""},
		{"free trial button", `<button>Start your free trial</button>`, "saas", ""},
		{"sign-up link", `<a href="https://app.example.com/signup">Sign up</a>`, "saas", ""},
		{"login link", `<a href="/login">Log in</a>`, "saas", ""},
		{"rss feed", `<link rel="alternate" type="application/rss+xml" href="/feed.xml">`, "content", ""},
		{"atom feed", `<link rel="alternate" type="application/atom+xml" href="/atom.xml">`, "content", ""},
		{"article markup", `<script type="application/ld+json">{"@type": "BlogPosting"}</script>`, "content", ""},
		{"article tag", `<article><h1>Hello</h1></article>`, "content", ""},
		{"blog path", `<a href="/blog/">Blog</a>`, "content", ""},
		{"nothing", `<h1>Hello</h1><a href="/about">About</a>`, "other", ""},
		{"empty page", ``, "other", ""},
		// Mixed pages: the first rule that matches wins, shop before saas
		// before content, except that a provider's script alone does not
		// outweigh a SaaS's own signs (SaaS pages embed Stripe too).
		{"cart and pricing", `<a href="/cart">c</a><a href="/pricing">p</a>`, "shop", ""},
		{"stripe and pricing", `<script src="https://js.stripe.com/v3/"></script><a href="/pricing">p</a>`, "saas", "stripe"},
		{"pricing and blog", `<a href="/pricing">p</a><a href="/blog">b</a>`, "saas", ""},
		{"blog with a login link", `<a href="/blog">b</a><a href="/login">l</a>`, "saas", ""},
		{"blog with stripe donate", `<a href="/blog">b</a><a href="https://buy.stripe.com/x">Donate</a>`, "shop", "stripe"},
		{"shopify and feed", `<link type="application/rss+xml"><script src="https://cdn.shopify.com/x.js"></script>`, "shop", ""},
		{"a path that only looks like cart", `<a href="/cartography">maps</a>`, "other", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			kind, provider := guessKind(tc.page)
			if kind != tc.kind || provider != tc.provider {
				t.Fatalf("got %s/%q, want %s/%q", kind, provider, tc.kind, tc.provider)
			}
		})
	}
}
