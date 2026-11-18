'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Invite {
  token: string
  company: string
  role: string
}

export default function PendingInvites() {
  const [invites, setInvites] = useState<Invite[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const response = await fetch('/api/invitations/mine')
      if (!response.ok) return
      const body = await response.json()
      if (!cancelled) setInvites(body.invites || [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (invites.length === 0) return null

  return (
    <div className="rounded-lg border border-border bg-accent p-4 text-sm">
      {invites.map((invite) => (
        <p key={invite.token}>
          You&apos;ve been invited to {invite.company} as a {invite.role}.{' '}
          <Link className="font-medium text-primary underline" href={`/join?token=${encodeURIComponent(invite.token)}`}>
            Join
          </Link>
        </p>
      ))}
    </div>
  )
}
