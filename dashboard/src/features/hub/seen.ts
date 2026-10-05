// Which features this person has looked at, in this browser, per signed-in
// person: the avatar menu's "New" dot stays while the pop-up lists a feature
// they have not seen. A browser that will not store it shows the dot again.

// Bumped when the list gains a feature: the dot comes back once for everyone.
const LIST = '1'
const key = (user: string) => `trckable:features:${user}`

/** Whether the list has features this person has not seen. */
export function hasUnseen(user: string): boolean {
  try {
    return localStorage.getItem(key(user)) !== LIST
  } catch {
    return false
  }
}

/** Everything listed now counts as seen. */
export function markAllSeen(user: string) {
  try {
    localStorage.setItem(key(user), LIST)
  } catch {
    /* private mode: seen for this page only */
  }
}
