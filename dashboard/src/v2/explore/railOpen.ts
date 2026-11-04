// Which folded entries of the section list are open: the one you are in, unless you opened or closed it yourself.
export type RailForce = Record<string, boolean | undefined>

export const railOpen = (force: RailForce, key: string, section: string): boolean => force[key] ?? key === section

export const railToggled = (force: RailForce, key: string, section: string): RailForce => ({ ...force, [key]: !railOpen(force, key, section) })

/** Pressing the entry itself leaves it to the section: open while you are in it. */
export const railPressed = (force: RailForce, key: string): RailForce => ({ ...force, [key]: undefined })
