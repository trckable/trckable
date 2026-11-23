// The folded entries of the section list are always open, unless you closed one yourself with its chevron.
export type RailForce = Record<string, boolean | undefined>

export const railOpen = (force: RailForce, key: string, _section: string): boolean => force[key] ?? true

export const railToggled = (force: RailForce, key: string, section: string): RailForce => ({ ...force, [key]: !railOpen(force, key, section) })

/** Pressing the entry itself opens it again. */
export const railPressed = (force: RailForce, key: string): RailForce => ({ ...force, [key]: undefined })
