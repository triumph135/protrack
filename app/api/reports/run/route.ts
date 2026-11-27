import { postRun } from '@/lib/reports/http'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  return postRun(request)
}
