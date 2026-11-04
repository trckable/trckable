// The words of the event card: the dialog a notification opens, with the concrete thing behind it. Apart from copy.ts so the
// bell does not carry it; only the card imports it.
import { defineCopy } from '../../i18n'

export const eventCopy = defineCopy('bell.event', {
  label: 'What happened',
  close: 'Close',
  loading: 'Loading…',
  failed: 'Could not load this. Try again.',
  seeExplore: 'See it in Explore',
  seeSignups: 'See all signups',
  seeGoal: 'See this goal',
  seeIncidents: 'See it in Incidents',
  seeMentions: 'See it in Mentions',
  // The visit behind a goal, a signup or a sale.
  openVisitor: 'Open this visitor’s story',
  page: 'Page',
  from: 'From',
  path: 'The path before it',
  toConvert: 'Time to convert',
  visitsBefore: 'Visits before',
  pagesSeen: 'Pages seen',
  noVisit: 'The visit behind this one is not shown: this site does not tell visitors apart, or it is too old.',
  // A sale.
  amount: 'Amount',
  kindNew: 'New customer',
  kindUpgrade: 'Upgrade',
  kindRenewal: 'Renewal',
  kindSale: 'Sale',
  country: 'Billing country',
  firstPages: 'The first pages of the visit',
  // An outage.
  started: 'Started',
  backUp: 'Back up',
  stillDown: 'Still down',
  lasted: 'Lasted',
  soFar: 'So far',
  checks: 'What our checks saw',
  // A mention.
  openPost: 'Open the post',
})
