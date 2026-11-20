import { getSubscriptions, patchSubscriptions } from '@/lib/reports/http'

export const runtime = 'nodejs'

export async function GET() {
  return getSubscriptions()
}

export async function PATCH(request: Request) {
  return patchSubscriptions(request)
}
