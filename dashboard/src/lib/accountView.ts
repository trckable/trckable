// The account this tab works in, for a person in two or more (until then the
// server picks their only one, and nothing is sent). Each tab names its own on
// every call, checked against the person's memberships each time, so two tabs
// never mix. Set by the start-up (lib/accountMove.ts).

/** An account the person is in, as /me lists it. */
export interface AccountCard {
  id: string
  name: string
  role: string
  /** The person is this account's first owner: they cannot leave it. */
  holder: boolean
  /** The first few sites they see there, and how many in all. */
  sites: { id: string; domain: string; name: string }[]
  total: number
}

/** The account id every call names, and every account the person is in, once
 *  they are in two or more (set before anything is drawn, by lib/accountMove.ts). */
export const view = { account: '', list: [] as AccountCard[] }
