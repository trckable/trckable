// Opens the Features pop-up from anywhere (the account window, the palette, ?features): the pop-up is its own chunk, fetched when asked.
export const openFeatures = () => void import('./show').then((m) => m.default())
