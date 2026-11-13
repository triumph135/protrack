import { NextResponse } from 'next/server'

// Invitations are accepted by /api/create-invited-user or the join-tenant
// flow. This route used to mark any invitation accepted with only its id.
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is disabled. Use the invitation link to accept.' },
    { status: 410 }
  )
}
