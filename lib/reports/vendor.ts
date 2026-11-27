/** One grouping key for free-text vendor names. Labor rows are not vendor spend. */

export function vendorKey(vendor: string | null | undefined): string {
  return (vendor ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function vendorDisplayName(spellings: Array<string | null | undefined>): string {
  const counts = new Map<string, number>()
  for (const spelling of spellings) {
    const raw = spelling ?? ''
    if (!vendorKey(raw)) continue
    counts.set(raw, (counts.get(raw) || 0) + 1)
  }
  if (counts.size === 0) return '(No vendor)'
  const ranked = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
  })
  return ranked[0][0]
}
