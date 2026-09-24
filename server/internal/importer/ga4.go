package importer

import (
	_ "embed"
	"net/url"
	"strings"
	"sync"
)

// GA4 has no raw export of its own. Its BigQuery export does: one row per
// event, with the page, the referrer and the campaign tucked into a list of
// key/value parameters and the device and location in nested records. Export
// the events_* tables as newline-delimited JSON and the rows arrive here
// exactly as BigQuery writes them.

// isGA4 tells a BigQuery export row from a flat one.
func isGA4(raw map[string]any) bool {
	_, name := raw["event_name"]
	_, ts := raw["event_timestamp"]
	_, params := raw["event_params"]
	return name && ts && params
}

// ga4Ignored are the events GA4 records about itself. They are housekeeping,
// not something a visitor did, and importing them as goals would bury the
// real ones.
var ga4Ignored = map[string]bool{
	"session_start": true, "first_visit": true, "user_engagement": true,
	"scroll": true, "form_start": true, "first_open": true,
	"video_progress": true, "video_start": true, "screen_view": true,
	"page_view_all": true, "app_remove": true, "os_update": true,
}

// ga4Row turns one BigQuery event into a row. ok is false for housekeeping
// events, which are left out rather than counted as skipped.
func ga4Row(raw map[string]any) (r Row, ok bool) {
	name := jsonField(raw, "event_name")
	if ga4Ignored[name] {
		return r, false
	}
	params := ga4Params(raw["event_params"])
	device, _ := raw["device"].(map[string]any)
	web, _ := device["web_info"].(map[string]any)
	geo, _ := raw["geo"].(map[string]any)
	src, _ := raw["collected_traffic_source"].(map[string]any)

	r = Row{
		TS:      jsonField(raw, "event_timestamp"), // microseconds
		Visitor: jsonField(raw, "user_pseudo_id"),
		Country: countryCode(notSet(jsonField(geo, "country"))),
		Region:  notSet(jsonField(geo, "region")),
		City:    notSet(jsonField(geo, "city")),
		Device:  title(notSet(jsonField(device, "category"))),
		Browser: notSet(first(jsonField(web, "browser"), jsonField(device, "browser"))),
		OS:      notSet(jsonField(device, "operating_system")),
	}
	if name != "page_view" {
		r.Goal = name
	}

	// The page, without its query string: trckable keeps paths, and a query
	// is where emails and tokens end up. Its campaign tags are read first.
	page, _ := url.Parse(params["page_location"])
	if page != nil && page.Host != "" {
		r.Path = page.EscapedPath()
		if r.Path == "" {
			r.Path = "/"
		}
	}
	// A referrer from the same site is a click inside it, not a source.
	if ref := params["page_referrer"]; ref != "" {
		if u, err := url.Parse(ref); err != nil || page == nil || !strings.EqualFold(u.Host, page.Host) {
			r.Referrer = ref
		}
	}

	// Campaigns: what GA4 collected for this event, then the event's own
	// parameters, then the tags on the page's address. traffic_source is the
	// user's first visit ever, so it is never used for a later one.
	var q url.Values
	if page != nil {
		q = page.Query()
	}
	r.Source = notSet(first(jsonField(src, "manual_source"), params["source"], q.Get("utm_source")))
	r.Medium = notSet(first(jsonField(src, "manual_medium"), params["medium"], q.Get("utm_medium")))
	r.Campaign = notSet(first(jsonField(src, "manual_campaign_name"), params["campaign"], q.Get("utm_campaign")))
	if r.Source == "(direct)" {
		r.Source = ""
	}
	if r.Medium == "(none)" {
		r.Medium = ""
	}
	return r, true
}

// ga4Params flattens event_params into key → value. BigQuery writes every
// value under the one field its type uses, and integers as strings.
func ga4Params(v any) map[string]string {
	out := map[string]string{}
	list, _ := v.([]any)
	for _, item := range list {
		p, _ := item.(map[string]any)
		key, _ := p["key"].(string)
		val, _ := p["value"].(map[string]any)
		if key == "" || val == nil {
			continue
		}
		for _, f := range []string{"string_value", "int_value", "double_value", "float_value"} {
			if s := jsonField(val, f); s != "" {
				out[key] = s
				break
			}
		}
	}
	return out
}

func first(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// notSet is GA4's way of saying nothing.
func notSet(s string) string {
	if s == "(not set)" || s == "(data not available)" || s == "(other)" {
		return ""
	}
	return s
}

func title(s string) string {
	if s == "" {
		return ""
	}
	return strings.ToUpper(s[:1]) + strings.ToLower(s[1:])
}

//go:embed countries.txt
var countriesTxt string

var (
	countriesOnce sync.Once
	countries     map[string]string
)

// countryCode turns "Germany" into "DE". GA4 exports country names; trckable
// stores codes. A name it does not know is dropped, not stored as a code.
func countryCode(name string) string {
	if name == "" {
		return ""
	}
	if len(name) == 2 {
		if strings.EqualFold(name, "UK") {
			return "GB"
		}
		return strings.ToUpper(name)
	}
	countriesOnce.Do(func() {
		countries = map[string]string{}
		for _, line := range strings.Split(countriesTxt, "\n") {
			if line == "" || line[0] == '#' {
				continue
			}
			f := strings.Split(line, "\t")
			for _, n := range f[1:] {
				countries[countryKey(n)] = f[0]
			}
		}
	})
	return countries[countryKey(name)]
}

// countryKey makes "Côte d’Ivoire", "Cote d'Ivoire" and "cote divoire" one name.
func countryKey(s string) string {
	var b strings.Builder
	space := false
	for _, c := range strings.ToLower(strings.ReplaceAll(s, "&", " and ")) {
		if f, ok := accents[c]; ok {
			c = f
		}
		switch {
		case c >= 'a' && c <= 'z':
			if space && b.Len() > 0 {
				b.WriteByte(' ')
			}
			b.WriteRune(c)
			space = false
		case c == ' ' || c == '-' || c == ',':
			space = true
		}
	}
	return b.String()
}

// accents covers every letter the country names use.
var accents = map[rune]rune{'ç': 'c', 'å': 'a', 'ã': 'a', 'é': 'e', 'í': 'i', 'ô': 'o', 'ü': 'u'}
