package api

import "github.com/trckable/trckable/server/internal/store/sqlite"

// Action is one thing a person may be allowed to do. This file is the only
// place that says which role may do which: handlers and the request guard ask
// Can, and nothing else compares a role. The dashboard keeps the same table
// (dashboard/src/lib/permissions.ts); permissions_test.go holds both to the
// one fixture, dashboard/src/lib/permissions.json.
type Action string

const (
	// ActChange is every create, edit and delete on the instance: any request
	// that is not a read, outside the person's own account.
	ActChange Action = "instance.change"
	// ActAccountOwn is looking after your own account: password, name, picture,
	// second step, shortcuts, devices and read notices.
	ActAccountOwn Action = "account.own"
	// ActSitesAll is seeing every site; without it a person sees the sites
	// they were given.
	ActSitesAll Action = "sites.all"
	// ActMemberManage is seeing and changing who may use the instance.
	ActMemberManage Action = "member.manage"
	// ActKeyRead is seeing the instance's API keys.
	ActKeyRead Action = "key.read"
	// ActFeedbackRead is reading the feedback people sent.
	ActFeedbackRead Action = "feedback.read"
	// ActSearchConnect is setting up the Search Console connection.
	ActSearchConnect Action = "search.connect"
	// ActImportGoogle is importing from Google Analytics.
	ActImportGoogle Action = "import.google"
	// ActSecretRead is reading a payment connection's signing secret.
	ActSecretRead Action = "secret.read"
	// ActProxyKey is seeing a site's proxy key.
	ActProxyKey Action = "proxy.key"
	// ActAlertTarget is seeing where an alert goes (a webhook URL is a secret).
	ActAlertTarget Action = "alert.target"
	// ActUpdateCheck is being told that a newer version is out.
	ActUpdateCheck Action = "update.check"
)

var ownerActions = []Action{
	ActChange, ActAccountOwn, ActSitesAll, ActMemberManage, ActKeyRead, ActFeedbackRead,
	ActSearchConnect, ActImportGoogle, ActSecretRead, ActProxyKey, ActAlertTarget, ActUpdateCheck,
}

// permissions is the one role to actions table. An unknown role has no row
// and may do nothing.
var permissions = map[string]map[Action]bool{
	sqlite.RoleOwner:  actionSet(ownerActions...),
	sqlite.RoleViewer: actionSet(ActAccountOwn),
}

func actionSet(a ...Action) map[Action]bool {
	m := make(map[Action]bool, len(a))
	for _, x := range a {
		m[x] = true
	}
	return m
}

// Can reports whether role may do action.
func Can(role string, action Action) bool {
	return permissions[role][action]
}

// DefineRole gives a role its row, for a build that has a role of its own. It is
// called while the program starts, before any request is served.
// Calling it again for the same role replaces the row.
func DefineRole(role string, actions ...Action) {
	permissions[role] = actionSet(actions...)
}

// canUser is Can for a request's person; no person (an API key) may do none
// of the owner-only things.
func canUser(u *sqlite.User, action Action) bool {
	return u != nil && Can(u.Role, action)
}
