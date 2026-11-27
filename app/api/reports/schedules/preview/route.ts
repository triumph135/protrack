import { postSchedulePreview } from '@/lib/reports/http'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  return postSchedulePreview(request)
}
