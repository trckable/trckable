package notice

import (
	"sort"
	"strings"

	"github.com/trckable/trckable/server/internal/mailkit"
)

// Vars are the facts a notice's words are made of ("domain", "by", "when").
// They are plain text: the email and the dashboard's bell each put their own
// words around them.
type Vars map[string]string

// Message is the email a kind sends.
type Message struct {
	Subject string
	Eyebrow string
	Title   string
	Text    string
	Tone    mailkit.Tone
	Rows    [][2]string
	// Button is the label of a link to the dashboard page Path, when there is one.
	Button string
	Path   string
	// Note is the small print: why the person gets this.
	Note string
}

// Spec is one kind of notice: who may mute it, and what it says.
type Spec struct {
	// Always: security and billing notices are never muted by anyone's
	// preferences.
	Always bool
	// Bell: the dashboard's bell tells it, where the build has a bell.
	Bell bool
	// Email builds the email, or is nil for a kind the bell alone tells.
	Email func(Vars) Message
}

const (
	NewDevice        = "security.new_device"
	PasswordChanged  = "security.password_changed"
	PasswordReset    = "security.password_reset"
	TwoStepOff       = "security.two_step_off"
	RecoveryCodeUsed = "security.recovery_code_used"
	KeyCreated       = "security.key_created"
	KeyRevoked       = "security.key_revoked"
	MemberRemoved    = "team.member_removed"
	RoleChanged      = "team.role_changed"
	SiteAdded        = "site.added"
	SiteRemoved      = "site.removed"
	VerifyFailed     = "site.verify_failed"
	ChannelConnected = "channel.connected"
	ChannelGone      = "channel.disconnected"
	DataExported     = "data.exported"
	RetentionChanged = "retention.changed"
	RetentionShorter = "retention.shortened"
	securityNote     = "You get this because it is about your sign-in and your data. It cannot be switched off."
	teamNote         = "You get this because it concerns your team."
	ownersNote       = "You get this because you are an owner."
	siteSettingsPath = "/settings"
	securitySettings = "/settings"
)

// Kinds is every notice there is, by its stable name. A kind is added here
// and nowhere else: the tests check that each one has words, and the
// dashboard's bell has to know each one.
var Kinds = map[string]Spec{
	NewDevice: {Always: true, Bell: true, Email: func(v Vars) Message {
		return Message{
			Subject: "New sign-in to your trckable account", Eyebrow: "Security", Title: "A new browser signed in",
			Text: "Your account was just signed in to from a browser we have not seen before. If that was you, there is nothing to do.",
			Tone: mailkit.Warn, Rows: rows(v, "when", "When", "place", "Where", "browser", "Browser"),
			Button: "Review your account", Path: securitySettings, Note: securityNote,
		}
	}},
	PasswordChanged: {Always: true, Bell: true, Email: func(v Vars) Message {
		return Message{
			Subject: "Your trckable password was changed", Eyebrow: "Security", Title: "Your password was changed",
			Text: "The password for your account was just changed, and your other sign-ins were ended. If that was not you, ask an owner to reset it right away.",
			Tone: mailkit.Warn, Rows: rows(v, "when", "When"), Note: securityNote,
		}
	}},
	PasswordReset: {Always: true, Bell: true, Email: func(v Vars) Message {
		return Message{
			Subject: "An owner reset your trckable password", Eyebrow: "Security", Title: "Your password was reset",
			Text: who(v, "by") + " reset your password. Every sign-in of yours was ended, and you choose a new password the next time you sign in.",
			Tone: mailkit.Warn, Rows: rows(v, "when", "When"), Note: securityNote,
		}
	}},
	TwoStepOff: {Always: true, Bell: true, Email: func(v Vars) Message {
		return Message{
			Subject: "Two-step sign-in was turned off for you", Eyebrow: "Security", Title: "Two-step sign-in is off",
			Text: who(v, "by") + " turned off two-step sign-in for your account. You can set it up again in your account settings.",
			Tone: mailkit.Warn, Rows: rows(v, "when", "When"), Button: "Set it up again", Path: securitySettings, Note: securityNote,
		}
	}},
	RecoveryCodeUsed: {Always: true, Bell: true, Email: func(v Vars) Message {
		return Message{
			Subject: "A recovery code was used on your trckable account", Eyebrow: "Security", Title: "A recovery code was used",
			Text: "Someone signed in with one of your recovery codes. Each code works once. If that was not you, change your password now.",
			Tone: mailkit.Bad, Rows: rows(v, "when", "When", "place", "Where"), Button: "Review your account", Path: securitySettings, Note: securityNote,
		}
	}},
	KeyCreated: {Always: true, Bell: true, Email: func(v Vars) Message {
		return Message{
			Subject: "An API key was created", Eyebrow: "Security", Title: "A new API key",
			Text: who(v, "by") + " created an API key. It can read this account's numbers until it is revoked.",
			Tone: mailkit.Warn, Rows: rows(v, "name", "Name", "when", "When"), Button: "See the keys", Path: "/settings", Note: securityNote,
		}
	}},
	KeyRevoked: {Always: true, Bell: true, Email: func(v Vars) Message {
		return Message{
			Subject: "An API key was revoked", Eyebrow: "Security", Title: "An API key was revoked",
			Text: who(v, "by") + " revoked an API key. Anything that used it stops working.",
			Rows: rows(v, "name", "Name", "when", "When"), Button: "See the keys", Path: "/settings", Note: securityNote,
		}
	}},
	MemberRemoved: {Bell: true, Email: func(v Vars) Message {
		return Message{
			Subject: v["who"] + " was removed from the team", Eyebrow: "Team", Title: v["who"] + " was removed",
			Text: v["who"] + " no longer has access. " + who(v, "by") + " removed them.",
			Tone: mailkit.Neutral, Rows: rows(v, "when", "When"), Note: teamNote,
		}
	}},
	RoleChanged: {Bell: true, Email: func(v Vars) Message {
		return Message{
			Subject: "A role on the team changed", Eyebrow: "Team", Title: v["who"] + " is now " + article(v["role"]),
			Text: who(v, "by") + " changed what " + v["who"] + " can do on this team.",
			Rows: rows(v, "role", "New role", "when", "When"), Button: "See the team", Path: "/settings", Note: teamNote,
		}
	}},
	SiteAdded:   {Bell: true},
	SiteRemoved: {Bell: true},
	VerifyFailed: {Bell: true, Email: func(v Vars) Message {
		return Message{
			Subject: "trckable cannot see " + v["domain"], Eyebrow: "Install", Title: "The install check failed",
			Text: "We looked at " + v["domain"] + " and did not find the trckable snippet. Visits will not be counted until it is back.",
			Tone: mailkit.Bad, Rows: rows(v, "reason", "What we saw"), Button: "Check the install", Path: siteSettingsPath, Note: "You get this because you manage this site.",
		}
	}},
	ChannelConnected: {Bell: true},
	ChannelGone:      {Bell: true},
	DataExported:     {Bell: true},
	RetentionChanged: {Bell: true},
	RetentionShorter: {Bell: true, Email: func(v Vars) Message {
		return Message{
			Subject: "Data retention was shortened for " + v["domain"], Eyebrow: "Your data", Title: "Older data will be deleted",
			Text: who(v, "by") + " changed how long " + v["domain"] + " keeps its data, from " + v["from"] + " to " + v["to"] + ". Anything older is deleted and cannot be brought back.",
			Tone: mailkit.Warn, Rows: rows(v, "from", "Was", "to", "Now", "when", "When"), Button: "Open the settings", Path: siteSettingsPath, Note: ownersNote,
		}
	}},
}

// Names lists every kind, sorted.
func Names() []string {
	out := make([]string, 0, len(Kinds))
	for k := range Kinds {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// who names the person who did something, or says someone did.
func who(v Vars, key string) string {
	if s := strings.TrimSpace(v[key]); s != "" {
		return s
	}
	return "Someone"
}

// article says a role with its article: "an owner", "a viewer".
func article(role string) string {
	if role == "" {
		return "a member"
	}
	if strings.ContainsRune("aeiou", rune(role[0])) {
		return "an " + role
	}
	return "a " + role
}

// rows turns pairs of (key, label) into the rows of an email, leaving out what is empty.
func rows(v Vars, pairs ...string) [][2]string {
	var out [][2]string
	for i := 0; i+1 < len(pairs); i += 2 {
		if val := strings.TrimSpace(v[pairs[i]]); val != "" {
			out = append(out, [2]string{pairs[i+1], val})
		}
	}
	return out
}

// email draws a message with the mail kit; base is the dashboard's public
// address, empty when there is none (the button is then left out).
func email(m Message, base string) mailkit.Email {
	blocks := []mailkit.Block{mailkit.Heading{Eyebrow: m.Eyebrow, Title: m.Title}, mailkit.Callout{Tone: m.Tone, Text: m.Text}}
	if len(m.Rows) > 0 {
		blocks = append(blocks, mailkit.Rows{Rows: m.Rows})
	}
	if m.Button != "" && base != "" {
		blocks = append(blocks, mailkit.Button{Label: m.Button, URL: strings.TrimSuffix(base, "/") + m.Path})
	}
	return mailkit.Email{Title: m.Subject, Preheader: mailkit.Cut(m.Text, 140), Blocks: blocks, Foot: mailkit.Foot{Note: m.Note}}
}
