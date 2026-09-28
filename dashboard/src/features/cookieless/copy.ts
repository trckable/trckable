// What the dashboard says where cookieless mode leaves a number out. A daily
// hash cannot tell a returning visitor from a new one, or follow anyone past
// midnight UTC, so those places say "Off" rather than show numbers that
// mean nothing (every visitor new, every journey one day long).
export const copy = {
  off: 'Off: cookieless mode',
  why: 'Cookieless mode counts visitors by a daily hash: nobody is recognised the next day, so there is no new vs returning and no journey to follow.',
  newVsReturning: 'New vs returning',
  journeys: 'Journeys',
  journeysOff: 'Journeys · Off: cookieless mode',
}
