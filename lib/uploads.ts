/**
 * Upload queued files in order. The first failure stops the run and returns
 * that file plus everything not yet attempted, so the caller can retry them
 * from the saved entry.
 */
export async function uploadQueue<T>(
  items: T[],
  upload: (item: T) => Promise<unknown>
): Promise<{ uploaded: T[]; failed: T[]; error: string | null }> {
  const uploaded: T[] = []
  for (let index = 0; index < items.length; index += 1) {
    try {
      await upload(items[index])
      uploaded.push(items[index])
    } catch (error) {
      return {
        uploaded,
        failed: items.slice(index),
        error: error instanceof Error ? error.message : 'Upload failed',
      }
    }
  }
  return { uploaded, failed: [], error: null }
}
