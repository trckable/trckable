package api

// The ghost, for the "Counted by trckable" line under a widget: the same two
// paths as dashboard/src/brand/logo.ts, the one definition of the logo
// (TestWidgetLogoMatchesTheBrand keeps them equal). Drawn inline, so the
// widget still loads nothing.
const (
	logoGhost = "M12 30a20 20 0 0 1 40 0v22l-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5-5 3.5z"
	logoLine  = "M5 47l12-6 9 4 12-9 9 3 12-12"
)

const widgetGhost = `<svg width="16" height="16" viewBox="0 0 64 64" aria-hidden="true">` +
	`<path d="` + logoGhost + `" fill="#b8ff3c"/>` +
	`<circle cx="25.5" cy="29" r="3.6" fill="#0b0d10"/><circle cx="38.5" cy="29" r="3.6" fill="#0b0d10"/>` +
	`<path d="` + logoLine + `" fill="none" stroke="var(--bg)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
	`<path d="` + logoLine + `" fill="none" stroke="var(--fg)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` +
	`</svg>`
