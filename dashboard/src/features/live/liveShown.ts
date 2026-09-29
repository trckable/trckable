// Whether Live's panels are on screen. The address asks for Live (?view=live),
// but a site with no visit yet has nothing to watch: its install screen comes
// first, in Live and in Data alike. The address keeps the person's choice, so
// the first visit (or a switch back to a working site) lands in that mode.
export function liveShown(o: { wanted: boolean; shared: boolean; waiting: boolean }): boolean {
  return o.wanted && !o.shared && !o.waiting
}
