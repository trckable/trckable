// A managed instance (TRCKABLE_MANAGED on the server): a hosting provider
// such as trckable Cloud signs people in, so there is no sign-in page, no
// password and no second step here. Empty on a self-hosted instance.
let url = ''

/** The provider's sign-in page, or '' when this instance signs people in itself. */
export const managed = (): string => url

export function setManaged(u: string | undefined) {
  url = u ?? ''
}
