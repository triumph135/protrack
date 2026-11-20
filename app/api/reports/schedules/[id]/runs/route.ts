import { getRuns } from '@/lib/reports/http'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return getRuns(id)
}
