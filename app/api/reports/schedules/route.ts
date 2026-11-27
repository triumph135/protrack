import { getSchedules, postSchedule } from '@/lib/reports/http'

export const runtime = 'nodejs'

export async function GET() {
  return getSchedules()
}

export async function POST(request: Request) {
  return postSchedule(request)
}
