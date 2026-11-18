'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/feedback'

function LoadingFallback() {
  return <p className="text-center text-sm text-muted-foreground">Loading…</p>
}

function ResetPasswordContent() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [supabase] = useState(() => createClient())
  const token = searchParams.get('token')
  const tokenHash = searchParams.get('token_hash')

  useEffect(() => {
    const handleAuth = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const authType = hashParams.get('type')

        if (accessToken && refreshToken && authType === 'recovery') {
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (sessionError || !sessionData.user) {
            setError('Invalid or expired reset link. Please request a new password reset.')
            setLoading(false)
            return
          }
          setUser(sessionData.user)
          window.history.replaceState({}, document.title, window.location.pathname)
          setLoading(false)
          return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setUser(session.user)
          setLoading(false)
          return
        }

        if (token || tokenHash) {
          setUser({ email: 'Token-based reset' } as User)
          setLoading(false)
          return
        }

        setError('Invalid or expired reset link. Please request a new password reset.')
        setLoading(false)
      } catch (err) {
        console.error('Error handling authentication:', err)
        setError('Failed to verify reset link. Please try again.')
        setLoading(false)
      }
    }
    handleAuth()
  }, [token, tokenHash, supabase])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!password) {
      setError('Password is required')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (!user) return
    try {
      setSubmitting(true)
      setError('')
      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (verifyError) throw new Error('Invalid or expired reset link')
      }
      const { error: passwordError } = await supabase.auth.updateUser({ password })
      if (passwordError) throw passwordError
      setSuccess(true)
      await supabase.auth.signOut()
      setTimeout(() => {
        router.push('/login?message=Password updated successfully! Please log in with your new password.')
      }, 2000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update password. Please try again.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-center text-sm text-muted-foreground">Verifying reset link…</p>

  if (error && !user) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold">Invalid link</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button type="button" className="mt-6 w-full" onClick={() => router.push('/login')}>Go to sign in</Button>
      </div>
    )
  }

  if (success) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold">Password updated</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in with the new password. This page will send you there.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {user?.email && user.email !== 'Token-based reset' ? `For ${user.email}` : 'Enter the password you want to use next time.'}
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error ? <Notice tone="warning">{error}</Notice> : null}
        <Field label="New password" htmlFor="password" hint="Minimum 6 characters">
          <div className="relative">
            <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" className="pr-12" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} />
            <button type="button" className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((current) => !current)}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label="Confirm password" htmlFor="confirm-password">
          <Input id="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={submitting} />
        </Field>
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Updating…' : 'Update password'}</Button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordContent />
    </Suspense>
  )
}
