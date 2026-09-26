// A managed instance (TRCKABLE_MANAGED on the server): a hosting provider
// such as trckable Cloud signs people in, so there is no sign-in page, no
// password and no second step here. Empty on a self-hosted instance.
let url = ''

/** The provider's sign-in page, or '' when this instance signs people in itself. */
export const managed = (): string => url

export function setManaged(u: string | undefined) {
  url = u ?? ''
}

/** Where Sign out leads: the provider's page, told to end its own session too,
 * or this instance's sign-in page. */
export function signedOutPage(): string {
  if (!url) return '/login'
  const u = new URL(url, location.href)
  u.searchParams.set('signedout', '1')
  return u.href
}
