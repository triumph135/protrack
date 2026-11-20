import { getDefinitions, postDefinition } from '@/lib/reports/http'

export const runtime = 'nodejs'

export async function GET() {
  return getDefinitions()
}

export async function POST(request: Request) {
  return postDefinition(request)
}
