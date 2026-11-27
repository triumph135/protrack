import { postCron } from '@/lib/reports/http'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  return postCron(request)
}
