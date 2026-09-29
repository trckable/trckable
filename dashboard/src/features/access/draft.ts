/** Whether the ticked sites differ from what is saved: null is All sites, and
 *  the order they were ticked in does not matter. */
export function changed(saved: string[] | null, draft: string[] | null): boolean {
  if (saved === null || draft === null) return saved !== draft
  if (saved.length !== draft.length) return true
  const now = new Set(draft)
  return saved.some((id) => !now.has(id))
}
