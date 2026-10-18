// Who is signed in and what kind of page this is. What a role may do is not
// here: that is permissions.ts (`can`). A role with no row there may do
// nothing, so a missing or new role never shows a control the server would
// refuse.
let role = ''
let mentionsOn = false // set with the role, from /me: whether the server has Mentions switched on
let answersOn = false // and whether it asks the AI assistants (an engine key is set)

export const setRole = (r?: string, withMentions?: boolean, withAnswers?: boolean) => {
  role = r ?? ''
  mentionsOn = withMentions === true
  answersOn = withAnswers === true
}

/** The role to ask the table about: a shared link reads, whoever opens it. */
export const currentRole = () => (shared ? 'viewer' : role)

// A shared link is one site's numbers and nothing else: no account, no
// settings, no live stream, no notes. The server already refuses all of it;
// this keeps the page from offering what would only come back refused.
let shared = false
let sharedMods: Record<string, boolean> = {}

export const setShared = (modules?: Record<string, boolean>) => {
  shared = true
  if (modules) sharedMods = modules
}

export const isShared = () => shared

// Mentions is switched on by the server (TRCKABLE_MENTIONS); off, nothing of it is offered.
export const hasMentions = () => mentionsOn

// Answers is on when the server holds a key for at least one AI assistant; off, nothing of it is offered.
export const hasAnswers = () => answersOn

/** Which modules the shared site has on: they travel with the link, because a
 *  shared page cannot ask for them itself. */
export const sharedModules = () => sharedMods
