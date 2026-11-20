'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { UnsubscribeCard } from '@/components/reports/views'

function UnsubscribeForm() {
  const token = useSearchParams().get('token') || ''
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  return (
    <UnsubscribeCard
      done={done}
      error={error || (token ? '' : 'This link is no longer valid.')}
      onConfirm={async () => {
        const response = await fetch('/api/reports/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) setError((body as { error?: string }).error || 'This link is no longer valid.')
        else setDone(true)
      }}
    />
  )
}

export default function UnsubscribePage() {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Loading…</p>}>
        <UnsubscribeForm />
      </Suspense>
    </main>
  )
}
