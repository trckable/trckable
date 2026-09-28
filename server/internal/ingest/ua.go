package ingest

import (
	"regexp"

	"github.com/mileusna/useragent"
)

// botRE catches automation the UA parser misses. AI crawlers are tracked
// separately (later module), never as visitors.
var botRE = regexp.MustCompile(`(?i)(bot|crawl|spider|slurp|scrap|headless|phantom|lighthouse|pagespeed|pingdom|uptime|monitor|statuscake|curl|wget|python-requests|python-urllib|aiohttp|httpx|go-http-client|axios|node-fetch|undici|java/|okhttp|libwww|facebookexternalhit|embedly|preview|validator|feedfetcher|mediapartners|chatgpt-user|gptbot|claude-web|anthropic|perplexity|bytespider|petalbot|yandex|baidu|semrush|ahrefs|mj12|dotbot|dataforseo)`)

type uaInfo struct {
	Browser, OS, Device string
	Bot                 bool
}

func parseUA(s string, screenWidth int) uaInfo {
	if s == "" {
		return uaInfo{Bot: true} // real browsers always send a user agent
	}
	if botRE.MatchString(s) {
		return uaInfo{Bot: true}
	}
	ua := useragent.Parse(s)
	if ua.Bot {
		return uaInfo{Bot: true}
	}
	info := uaInfo{Browser: ua.Name, OS: ua.OS}
	switch {
	case ua.Tablet:
		info.Device = "Tablet"
	case ua.Mobile:
		info.Device = "Mobile"
	case ua.Desktop:
		info.Device = "Desktop"
	}
	// Screen width settles ambiguous cases (e.g. iPadOS reporting as macOS).
	if screenWidth > 0 && (info.Device == "" || info.Device == "Desktop") {
		switch {
		case screenWidth < 768:
			info.Device = "Mobile"
		case screenWidth < 1024 && info.OS == "macOS":
			info.Device = "Tablet"
		case info.Device == "":
			info.Device = "Desktop"
		}
	}
	return info
}
