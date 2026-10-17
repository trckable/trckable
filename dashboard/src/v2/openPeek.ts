// Opens Peek (the Ask panel): the header's ghost, ⌘K's "Ask" and the key all say the same event; the build that has the panel listens.
export const openPeek = () => window.dispatchEvent(new Event('trckable:ask'))
