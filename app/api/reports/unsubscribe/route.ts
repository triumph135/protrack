import { postUnsubscribe } from '@/lib/reports/http'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  return postUnsubscribe(request)
}
