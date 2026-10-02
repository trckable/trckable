package ingest

import "strings"

// routeFragment is what is kept of the part after "#" for a site that routes
// by it (/#/pricing). A hash can carry more than a route: an OAuth answer
// (#access_token=...), a magic-link token, an email address. Only what looks
// like a route is kept: key=value pairs, a query inside the hash, a second "#",
// anything with an "@" and long opaque strings are dropped. Dropping the whole
// fragment is the safe answer when nothing route-like is left.
func routeFragment(f string) string {
	if i := strings.IndexAny(f, "?#"); i >= 0 {
		f = f[:i]
	}
	if strings.ContainsAny(f, "=&;@ ") {
		return ""
	}
	f = strings.TrimPrefix(f, "!") // the old "#!/route" form
	segs := strings.Split(f, "/")
	for i, s := range segs {
		if looksSecret(s) {
			segs[i] = ":redacted"
		}
	}
	return strings.Join(segs, "/")
}

// looksSecret is true for a path segment that is a token rather than a word:
// a JWT, or a long run of letters and digits that mixes both, such as a reset
// key or a session id. Plain words and short numeric ids pass.
func looksSecret(s string) bool {
	if strings.HasPrefix(s, "eyJ") && strings.Count(s, ".") == 2 {
		return true
	}
	if len(s) < 20 {
		return false
	}
	var letters, digits int
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9':
			digits++
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z':
			letters++
		case r == '-' || r == '_' || r == '.':
		default:
			return false // spaces, accents, punctuation: prose, not a token
		}
	}
	return letters > 0 && digits > 0
}
