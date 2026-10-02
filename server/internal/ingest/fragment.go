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
	bang := ""
	if strings.HasPrefix(f, "!") { // the old "#!/route" form keeps its mark
		bang, f = "!", f[1:]
	}
	segs := strings.Split(f, "/")
	for i, s := range segs {
		if looksSecret(s) {
			segs[i] = ":redacted"
		}
	}
	return bang + strings.Join(segs, "/")
}

// looksSecret is true for a path segment that is a token rather than a word:
// a JWT, a phone number, a long run of digits, or a long string of letters,
// digits and the few marks tokens use (- _ . + : ~ %) that is not a slug.
// Plain words, slugs ("how-to-use-trckable-2026") and short numeric ids pass.
func looksSecret(s string) bool {
	if strings.HasPrefix(s, "eyJ") && strings.Count(s, ".") == 2 {
		return true
	}
	run := digitRun(s)
	if run >= 12 || (strings.HasPrefix(s, "+") && run >= 8) {
		return true
	}
	if len(s) < 20 || isSlug(s) {
		return false
	}
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9', r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z':
		case strings.ContainsRune("-_.+:~%", r):
		default:
			return false // spaces, accents, other punctuation: prose, not a token
		}
	}
	return true
}

// isSlug is a readable page name: at least three parts split by - or _, each
// one a plain word or a short number ("how-to-use-trckable-2026-edition"). A
// UUID or a hex key is not: its parts mix letters and digits.
func isSlug(s string) bool {
	parts := strings.FieldsFunc(s, func(r rune) bool { return r == '-' || r == '_' })
	if len(parts) < 3 {
		return false
	}
	for _, p := range parts {
		letters, digits := 0, 0
		for _, r := range p {
			switch {
			case r >= '0' && r <= '9':
				digits++
			case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z':
				letters++
			default:
				return false
			}
		}
		if letters > 0 && digits > 0 || digits > 6 || letters > 30 {
			return false
		}
	}
	return true
}

func digitRun(s string) (best int) {
	run := 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			run++
			if run > best {
				best = run
			}
		} else {
			run = 0
		}
	}
	return best
}
