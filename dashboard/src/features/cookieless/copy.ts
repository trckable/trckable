// What the dashboard says where cookieless mode leaves a number out. A daily
// hash cannot tell a returning visitor from a new one, or follow anyone past
// midnight UTC, so those places say "Off" rather than show numbers that
// mean nothing (every visitor new, every journey one day long).
import { defineCopy } from '../../i18n'

export const copy = defineCopy('cookieless', {
  off: 'Off: cookieless mode',
  newVsReturning: 'New vs returning',
  journeys: 'Journeys',
  journeysOff: 'Journeys · Off: cookieless mode',
})
