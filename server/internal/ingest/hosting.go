package ingest

// Networks that only host servers. A visit from one of them is a script on a
// rented machine, not a person at a browser: scrapers, uptime checks, AI
// agents, click farms. Stricter bot filtering drops them.
//
// What is deliberately NOT here: networks people browse through. Safari's
// iCloud Private Relay leaves through Akamai and Cloudflare, WARP through
// Cloudflare, and consumer VPNs through M247, Datacamp/CDN77 and others.
// Dropping those would drop real visitors, so a network is only listed when
// nobody browses from it.
var hostingASNs = map[uint32]string{
	16509:  "Amazon Web Services",
	14618:  "Amazon Web Services",
	8987:   "Amazon Web Services",
	396982: "Google Cloud",
	8075:   "Microsoft Azure",
	14061:  "DigitalOcean",
	62567:  "DigitalOcean",
	24940:  "Hetzner",
	213230: "Hetzner Cloud",
	16276:  "OVHcloud",
	63949:  "Akamai Linode (compute)",
	20473:  "Vultr",
	31898:  "Oracle Cloud",
	45102:  "Alibaba Cloud",
	37963:  "Alibaba Cloud",
	132203: "Tencent Cloud",
	45090:  "Tencent Cloud",
	51167:  "Contabo",
	12876:  "Scaleway",
	60781:  "Leaseweb",
	28753:  "Leaseweb",
	30633:  "Leaseweb",
	36352:  "ColoCrossing",
	53667:  "FranTech",
	8100:   "QuadraNet",
	46606:  "Unified Layer",
	26496:  "GoDaddy hosting",
	22612:  "Namecheap hosting",
	135377: "UCloud",
	197540: "netcup",
	58477:  "Hostinger",
}

// HostingASN reports whether an autonomous system only hosts servers.
func HostingASN(asn uint32) bool {
	_, ok := hostingASNs[asn]
	return ok
}
