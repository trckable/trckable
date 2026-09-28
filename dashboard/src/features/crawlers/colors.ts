// One colour per crawler, assigned by name so a filter never repaints them.
const COLORS = ['var(--ch-1)', 'var(--ch-2)', 'var(--ch-3)', 'var(--ch-4)', 'var(--ch-5)', 'var(--ch-6)', 'var(--ch-7)']

export const colorOf = (name: string) => COLORS[Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
