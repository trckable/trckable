package mentions

import "strings"

// Pages that sent visitors are mentions the visits themselves confirm: the
// page links to the site and people followed it. Some hosts are not pages
// anyone published (search results, webmail, chat, the owner's own tools), and
// an address there says nothing about the site or may be private.
var privateHosts = []string{
	"google.com", "bing.com", "duckduckgo.com", "yahoo.com", "baidu.com", "yandex.com", "yandex.ru", "ecosia.org", "brave.com", "startpage.com", "qwant.com", "kagi.com",
	"mail.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com", "mail.yahoo.com", "proton.me", "app.slack.com", "slack.com", "teams.microsoft.com",
	"docs.google.com", "drive.google.com", "mail.proton.me", "web.whatsapp.com", "web.telegram.org", "localhost",
}

// RefIgnored says whether a referrer host is one whose pages are never listed
// as mentions: a search engine, a mail or chat service, a local address.
func RefIgnored(host string) bool {
	host = strings.TrimPrefix(strings.ToLower(host), "www.")
	if host == "" || !strings.Contains(host, ".") || strings.HasPrefix(host, "mail.") || strings.HasPrefix(host, "webmail.") {
		return true
	}
	for _, p := range privateHosts {
		if host == p || strings.HasSuffix(host, "."+p) {
			return true
		}
	}
	return false
}
