// Who is signed in, for the handful of places that have to hide a control
// rather than let the server refuse it. The server is still the one enforcing
// this: the UI only avoids offering a button that would come back 403.
let role = 'owner'

export const setRole = (r?: string) => {
  role = r ?? 'owner'
}

// Whether this account runs the instance itself (the default account of a
// self-hosted server). Only then is there an instance's health to show.
let operator = true
export const setOperator = (o?: boolean) => {
  operator = o !== false
}
export const isOperator = () => operator

/** A viewer reads this instance. They change nothing except their own account. */
export const isViewer = () => role === 'viewer'

// A shared link is one site's numbers and nothing else: no account, no
// settings, no live stream, no notes. The server already refuses all of it;
// this keeps the page from offering what would only come back refused.
let shared = false
let sharedMods: Record<string, boolean> = {}

export const setShared = (modules?: Record<string, boolean>) => {
  shared = true
  role = 'viewer'
  if (modules) sharedMods = modules
}

export const isShared = () => shared

/** Which modules the shared site has on: they travel with the link, because a
 *  shared page cannot ask for them itself. */
export const sharedModules = () => sharedMods
