// The pieces of Settings → Sharing that are data, not markup.

/** How long a new link lasts. */
export const LASTS = [
  { days: 0, label: 'No end date' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'A year' },
]

/** The iframe for an embeddable link. The height fits Core mode; the page
 *  scrolls inside the frame if Full mode needs more. */
export function embedSnippet(url: string, domain: string) {
  return `<iframe src="${url}?embed=1" title="${domain} analytics" loading="lazy"\n  style="width: 100%; height: 1300px; border: 0;"></iframe>`
}
