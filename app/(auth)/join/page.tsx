'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { MIN_PASSWORD_LENGTH } from '@/lib/security'

interface Lookup {
  company: string
  roleLabel: string
  email: string | null
  type: string
  expired: boolean
  status: string
}

function JoinForm() {
  const params = useSearchParams()
  const token = params.get('token') || ''
  const router = useRouter()
  const { user, signIn, refreshUser } = useAuth()
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`)
      const body = await response.json()
      if (cancelled) return
      if (!response.ok) setError(body.error || 'Invitation not found')
      else setLookup(body)
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const accept = async () => {
    setBusy(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('accept_tenant_invitation', { p_token: token })
      if (rpcError) throw new Error(rpcError.message)
      await supabase.rpc('apply_invite_project_assignments', { p_token: token })
      await refreshUser()
      toast.success('You joined the company')
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join')
    } finally {
      setBusy(false)
    }
  }

  const createAndJoin = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      })
      const body = await response.json()
      if (!response.ok && !body.existing) throw new Error(body.error || 'Could not create the account')
      const signed = await signIn(body.email, password)
      if (signed.error) throw signed.error
      await accept()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join')
      setBusy(false)
    }
  }

  if (!token) return <p className="text-sm text-muted-foreground">This page needs an invite link.</p>
  if (!lookup && !error) return <p className="text-sm text-muted-foreground">Checking the invite…</p>

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h1 className="text-xl font-semibold">Join {lookup?.company || 'ProTrack'}</h1>
      {lookup ? (
        <p className="mt-1 text-sm text-muted-foreground">
          You were invited as a {lookup.roleLabel}{lookup.email ? ` for ${lookup.email}` : ''}.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {lookup?.expired ? <p className="mt-3 text-sm text-destructive">This invite is no longer active.</p> : null}
      {lookup && !lookup.expired && user ? (
        <Button className="mt-4" type="button" onClick={accept} disabled={busy}>Join {lookup.company}</Button>
      ) : null}
      {lookup && !lookup.expired && !user && lookup.type !== 'link' ? (
        <form className="mt-4 space-y-3" onSubmit={createAndJoin}>
          <Field label="Your name" htmlFor="join-name">
            <Input id="join-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Password" htmlFor="join-password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}>
            <Input id="join-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? 'Joining…' : `Join ${lookup.company}`}</Button>
        </form>
      ) : null}
      {lookup && !lookup.expired && !user && lookup.type === 'link' ? (
        <p className="mt-4 text-sm">Sign in first, then open this link again. A link invite can be used by any account that is not already in a company.</p>
      ) : null}
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <JoinForm />
    </Suspense>
  )
}
