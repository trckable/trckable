package api

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/trckable/trckable/server/internal/notice"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// What people are told about (internal/notice): a security change, a change to
// the team, a site, a channel or an export. Every notice goes through tell, so
// nothing sends mail or writes a bell entry on its own.

// tell hands a notice to the hub, which keeps it until it is delivered. A build
// without a hub tells no one.
func (a *API) tell(ctx context.Context, n notice.Notice) {
	if a.Notices == nil {
		return
	}
	if err := a.Notices.Notify(ctx, n); err != nil {
		slog.Warn("notice not written", "kind", n.Kind, "err", err)
	}
}

// stamp is now, in the words a notice gives.
func (a *API) stamp() string { return a.Now().UTC().Format("2 Jan 2006, 15:04 MST") }

// actor names who did something: the signed-in person, or an API key.
func actor(r *http.Request) string {
	if u := principalOf(r).user; u != nil {
		return u.Email
	}
	return "an API key"
}

// tellOwners tells the owners of the request's account what its person did.
func (a *API) tellOwners(r *http.Request, kind, site string, v notice.Vars) {
	v["by"], v["when"] = actor(r), a.stamp()
	n := notice.New(kind, principalOf(r).account, []notice.Audience{notice.Owners()}, v)
	n.Site = site
	a.tell(r.Context(), n)
}

// tellNewDevice tells a person that their account was signed in to from a
// browser or phone they had not used before. It is their own news alone.
func (a *API) tellNewDevice(r *http.Request, user, device string) {
	u, err := a.Ctl.UserByID(r.Context(), user)
	if err != nil {
		slog.Warn("new device not told", "err", err)
		return
	}
	v := notice.Vars{"when": a.stamp(), "place": a.locate(a.ip(r)), "browser": device}
	a.tell(r.Context(), notice.New(notice.NewDevice, u.AccountID, []notice.Audience{notice.Person(u.ID)}, v))
}

// browserOf is a short name for the browser a request came from.
func browserOf(r *http.Request) string {
	ua := r.UserAgent()
	for _, b := range []struct{ token, name string }{{"Edg/", "Edge"}, {"OPR/", "Opera"}, {"Firefox/", "Firefox"}, {"Chrome/", "Chrome"}, {"Safari/", "Safari"}} {
		if strings.Contains(ua, b.token) {
			return b.name
		}
	}
	return ""
}

// tellPerson tells a person what an owner did to their sign-in (a password
// reset, two-step turned off): theirs alone, and it cannot be switched off.
func (a *API) tellPerson(r *http.Request, kind, user string) {
	v := notice.Vars{"by": actor(r), "when": a.stamp()}
	a.tell(r.Context(), notice.New(kind, principalOf(r).account, []notice.Audience{notice.Person(user)}, v))
}

// tellRole tells the person whose role changed, and the owners, the new role.
// A role set to what it was is no change.
func (a *API) tellRole(r *http.Request, was sqlite.Person, role string) {
	if was.ID == "" || was.Role == role {
		return
	}
	v := notice.Vars{"who": was.Email, "role": role, "by": actor(r), "when": a.stamp()}
	a.tell(r.Context(), notice.New(notice.RoleChanged, principalOf(r).account, []notice.Audience{notice.Person(was.ID), notice.Owners()}, v))
}

// tellRemoved tells the owners, and the person who was removed (by address:
// they are no longer on the account), that they are gone.
func (a *API) tellRemoved(r *http.Request, gone sqlite.Person) {
	if gone.ID == "" {
		return
	}
	v := notice.Vars{"who": gone.Email, "by": actor(r), "when": a.stamp()}
	a.tell(r.Context(), notice.New(notice.MemberRemoved, principalOf(r).account, []notice.Audience{notice.Address(gone.Email), notice.Owners()}, v))
}

// keyName is what a key is called in a notice: its name, or that it has none.
func keyName(name string) string {
	if name = strings.TrimSpace(name); name != "" {
		return name
	}
	return "(no name)"
}

// keyNamed is the name of the key the request is about to revoke.
func (a *API) keyNamed(r *http.Request) string {
	keys, err := a.Ctl.ListAPIKeys(r.Context(), principalOf(r).account)
	if err != nil {
		return ""
	}
	for _, k := range keys {
		if k.ID == r.PathValue("id") {
			return keyName(k.Name)
		}
	}
	return ""
}

// tellRetention tells the owners that a site now keeps its data for a
// different time (0 is for ever). A shorter time also deletes data, so that
// one is told by email too.
func (a *API) tellRetention(r *http.Request, was, now int) {
	if was == now {
		return
	}
	kind := notice.RetentionChanged
	if now != 0 && (was == 0 || now < was) {
		kind = notice.RetentionShorter
	}
	domain := ""
	if si, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site")); err == nil {
		domain = si.Domain
	}
	a.tellOwners(r, kind, r.PathValue("site"), notice.Vars{"domain": domain, "from": keepWords(was), "to": keepWords(now)})
}

// keepWords says how long data is kept.
func keepWords(days int) string {
	if days == 0 {
		return "for ever"
	}
	if days == 1 {
		return "1 day"
	}
	return strconv.Itoa(days) + " days"
}

// tellExport tells the owners that a site's data was taken out of trckable.
func (a *API) tellExport(r *http.Request, site, what string) {
	domain := ""
	if si, err := a.Ctl.SiteInfo(r.Context(), site); err == nil {
		domain = si.Domain
	}
	a.tellOwners(r, notice.DataExported, site, notice.Vars{"domain": domain, "what": what})
}

// verifyReasons say, for a page that was read and did not carry the site's own
// snippet, what was there instead.
var verifyReasons = map[string]string{
	"other":  "trckable is on the page, but with another site's id",
	"nosite": "trckable is on the page, but without a site id",
	"none":   "trckable is not on the page",
}

// tellVerify tells the people who run a site when its install check, which
// found the snippet last time, reads the page and does not find it now. A
// page that could not be read says nothing about the snippet (the uptime
// check tells that), and a site that never worked is not news.
func (a *API) tellVerify(ctx context.Context, site, domain string, was sqlite.SiteCheck, now installCheck) {
	reason, bad := verifyReasons[now.Found]
	if !bad || now.Error != "" || was.Found != "site" || was.Error != "" {
		return
	}
	account, err := a.Ctl.SiteAccount(ctx, site)
	if err != nil {
		slog.Warn("install check not told", "site", site, "err", err)
		return
	}
	n := notice.New(notice.VerifyFailed, account, []notice.Audience{notice.Managers()}, notice.Vars{"domain": domain, "reason": reason})
	n.Site, n.Key = site, "verify:"+site+":"+a.Now().UTC().Format("2006-01-02")
	a.tell(ctx, n)
}

// TellRecovery tells a person that one of their recovery codes was just used to
// sign in (the store calls it). It is theirs alone, and it cannot be switched off.
func (a *API) TellRecovery(ctx context.Context, user string) {
	u, err := a.Ctl.UserByID(ctx, user)
	if err != nil {
		slog.Warn("recovery code use not told", "err", err)
		return
	}
	a.tell(ctx, notice.New(notice.RecoveryCodeUsed, u.AccountID, []notice.Audience{notice.Person(u.ID)}, notice.Vars{"when": a.stamp()}))
}
