// A site whose domain was just changed here: its old address, which the open page is still on, goes to the new one
// instead of being told it names no site (stray.ts).
const moved = new Map<string, string>()

export const rememberMove = (from: string, to: string) => void moved.set(from.toLowerCase(), to)
export const movedTo = (domain: string) => moved.get(domain.toLowerCase())
