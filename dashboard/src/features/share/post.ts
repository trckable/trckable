// Where a text post can go from the dialog: the address each network opens with the post already written, and
// the text as Slack takes it. The post is the words the dialog wrote; the link, when there is one, is a public link
// of the site that shows no more than the post does.
import type { Share } from '../../lib/api'

/** The link a post carries on its own: one anybody can open, that shows no revenue (the picture may not), and has not ended. */
export const postLink = (links: Share[], now = Date.now()): string | undefined => links.find((l) => l.url && !l.has_password && !l.revenue && (!l.expires_at || l.expires_at * 1000 > now))?.url

/** The post and its link as one text: the link on a line of its own, where every network turns it into a link. */
export const withLink = (post: string, url?: string) => (url ? `${post}\n${url}` : post)

/** X's own composer, with the text and the link filled in. */
export function xAddress(post: string, url?: string): string {
  const q = new URLSearchParams({ text: post })
  if (url) q.set('url', url)
  return `https://x.com/intent/post?${q}`
}

/** LinkedIn's composer, with the post and the link in its text (it has no field of its own for a link). */
export function linkedInAddress(post: string, url?: string): string {
  return `https://www.linkedin.com/feed/?${new URLSearchParams({ shareActive: 'true', text: withLink(post, url) })}`
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The post as Slack's composer takes a paste: plain text, and HTML with the link as a link (what it turns into a clickable one). */
export function slackText(post: string, url?: string): { text: string; html: string } {
  const lines = post.split('\n').map(escapeHtml)
  const link = url ? `<br><a href="${escapeHtml(url)}">${escapeHtml(url)}</a>` : ''
  return { text: withLink(post, url), html: `<p>${lines.join('<br>')}${link}</p>` }
}

/** Copies the post for Slack, as formatted text where the browser can and as plain text where it cannot. */
export async function copyForSlack(post: string, url?: string): Promise<void> {
  const { text, html } = slackText(post, url)
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })])
      return
    } catch {
      // A browser that refuses the rich copy still has the plain one.
    }
  }
  await navigator.clipboard.writeText(text)
}
