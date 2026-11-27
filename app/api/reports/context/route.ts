import { getContext } from '@/lib/reports/http'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  return getContext(request)
}
