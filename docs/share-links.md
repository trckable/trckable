---
title: "Your own look on share links"
description: "Your logo and colour on shared pages, and a custom domain behind Caddy."
---

A site's share links can carry your logo and colour instead of trckable's: in **Share → Link**, upload a logo (PNG, JPEG, GIF or SVG, up to 128 KB; an SVG is checked against a list of what a logo may contain and refused if it holds script or links to anything outside itself), pick a colour, and switch on **Hide trckable branding** to leave the wordmark and the small credit off the page and the password screen. You can also give the links a domain of their own, like `reports.example.com`. A domain is served only after you show it is yours: the dialog gives you a TXT record to add (`_trckable.reports.example.com` with a value it shows), and **Check** looks for it; until then the domain is pending and nothing changes. Then point a `CNAME` record for it at your trckable host (the dialog shows the exact line), and have your proxy serve it over https: links on that domain are always written as `https://`, so the proxy must provide the TLS (the dashboard's own address stays as it is). On a verified domain trckable answers share pages of that site only, and nothing else: no sign-in, no dashboard, no other site's link. A site can change its domain five times a day. Names that can never be a share domain: the dashboard's own address, and any you list in `TRCKABLE_RESERVED_HOSTS` (comma-separated). On an instance with one owner who controls every name, `TRCKABLE_SHARE_DOMAIN_SKIP_VERIFY=1` serves a domain as soon as it is set; it is off by default.

With Caddy, which gets a certificate for a name on the first visit once trckable says the name is one it serves:

```
{
	on_demand_tls {
		ask http://localhost:8080/api/v1/share-domain/ask
	}
}

dash.example.com {
	reverse_proxy localhost:8080
}

https:// {
	tls {
		on_demand
	}
	reverse_proxy localhost:8080
}
```

The `ask` address answers only a caller on the same machine that did not come through a proxy, which is how Caddy calls it; `TRCKABLE_SHARE_DOMAIN_ASK_OPEN=1` opens it to any caller. When Caddy runs in a container (Docker, Compose, Kubernetes) its call reaches trckable from the container network and not from the machine itself, so set `TRCKABLE_SHARE_DOMAIN_ASK_OPEN=1` there; the answer is only yes or no for one name.

Other proxies work the same way: forward the `Host` header unchanged, and get the certificate however you usually do. Shared pages send a Content-Security-Policy that allows nothing from outside the server, and a logo is only ever shown as a picture.

