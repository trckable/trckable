package ingest

import (
	"regexp"
	"strconv"

	"github.com/mileusna/useragent"
)

// botRE catches automation the UA parser misses. AI crawlers are tracked
// separately (later module), never as visitors.
var botRE = regexp.MustCompile(`(?i)(bot|crawl|spider|slurp|scrap|headless|phantom|lighthouse|pagespeed|pingdom|uptime|monitor|statuscake|curl|wget|python-requests|python-urllib|aiohttp|httpx|go-http-client|axios|node-fetch|undici|java/|okhttp|libwww|facebookexternalhit|embedly|preview|validator|feedfetcher|mediapartners|chatgpt-user|gptbot|claude-web|anthropic|perplexity|bytespider|petalbot|yandex|baidu|semrush|ahrefs|mj12|dotbot|dataforseo)`)

type uaInfo struct {
	Browser, OS, Device string
	// Version is the browser and its major version ("Chrome 129"), empty when
	// the user agent names no version. Only the major: the next digits tell
	// nothing a person can act on and would split one release into hundreds.
	Version string
	Bot     bool
	// BotKind says what sort of automation it is, for the count of what was
	// turned away (botcount.go). Empty when it is not one.
	BotKind string
}

// headlessRE is a browser driven by a program, or a tool that tests pages.
var headlessRE = regexp.MustCompile(`(?i)(headless|phantom|lighthouse|pagespeed)`)

// botKind sorts a user agent that is already known to be automation: an AI
// company's crawler (the answer and training ones, as the crawler report
// names them), a headless browser, or any other robot.
func botKind(s string) string {
	if c, ok := ClassifyCrawler(s); ok && (c.Kind == "answer" || c.Kind == "train") {
		return BotAI
	}
	if headlessRE.MatchString(s) {
		return BotHeadless
	}
	return BotOther
}

// browserVersion is "Chrome 129" for a browser and its major version.
func browserVersion(name string, major int) string {
	if name == "" || major <= 0 {
		return ""
	}
	return name + " " + strconv.Itoa(major)
}

func parseUA(s string, screenWidth int) uaInfo {
	if s == "" {
		return uaInfo{Bot: true, BotKind: BotOther} // real browsers always send a user agent
	}
	if botRE.MatchString(s) {
		return uaInfo{Bot: true, BotKind: botKind(s)}
	}
	ua := useragent.Parse(s)
	if ua.Bot {
		return uaInfo{Bot: true, BotKind: botKind(s)}
	}
	info := uaInfo{Browser: ua.Name, OS: ua.OS, Version: browserVersion(ua.Name, ua.VersionNo.Major)}
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
