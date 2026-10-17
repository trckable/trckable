// A dot on the person's avatar when something about the account needs them (a limit reached, a payment that failed). The
// public product has nothing to say here; a build that has more hands it in through the v2 slots (accountAlert).
export interface AccountAlert {
  /** What the dot says to a screen reader and in its tooltip. */
  label: string
  /** Amber asks for a look; red is already a problem. */
  tone: 'warn' | 'bad'
}

export function AccountDot({ alert }: { alert?: AccountAlert | null }) {
  if (!alert) return null
  return <span className={`acct-dot ${alert.tone}`} role="img" aria-label={alert.label} title={alert.label} />
}
