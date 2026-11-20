import { postSendNow } from '@/lib/reports/http'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return postSendNow(id)
}
