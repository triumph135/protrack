'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/feedback'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email) {
      setError('Email is required')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resetError) throw resetError
      setSuccess(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send password reset email. Please try again.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">We sent a reset link to <span className="font-medium text-foreground">{email}</span>.</p>
        <p className="mt-2 text-sm text-muted-foreground">Open the link in that email. If it is not there, check spam.</p>
        <div className="mt-6 space-y-3">
          <Button type="button" className="w-full" variant="outline" onClick={() => { setSuccess(false); setEmail('') }}>Send another email</Button>
          <Link href="/login" className="block text-sm text-primary">Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter your email and we will send a reset link.</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error ? <Notice tone="warning">{error}</Notice> : null}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isSubmitting} />
        </Field>
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Send reset link'}</Button>
        <p className="text-center text-sm">
          <Link href="/login" className="text-primary">Back to sign in</Link>
        </p>
      </form>
    </div>
  )
}
