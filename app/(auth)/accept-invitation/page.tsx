'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function Redirect() {
  const router = useRouter()
  const params = useSearchParams()
  useEffect(() => {
    const token = params.get('token')
    router.replace(token ? `/join?token=${encodeURIComponent(token)}` : '/join')
  }, [params, router])
  return <p className="text-sm text-muted-foreground">Opening your invite…</p>
}

export default function AcceptInvitationRedirect() {
  return (
    <Suspense>
      <Redirect />
    </Suspense>
  )
}
