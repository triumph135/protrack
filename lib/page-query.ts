/** Read every row of a tenant-scoped query. PostgREST stops at 1,000 unless the caller pages. */

export async function fetchAllRows<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>
): Promise<{ rows: T[]; error: { code?: string; message?: string } | null }> {
  const rows: T[] = []
  const size = 1000
  for (let from = 0; from < 200_000; from += size) {
    const result = await load(from, from + size - 1)
    if (result.error) return { rows: [], error: result.error }
    const batch = result.data ?? []
    rows.push(...batch)
    if (batch.length < size) return { rows, error: null }
  }
  return { rows, error: null }
}
