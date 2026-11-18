'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, User, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { MIN_PASSWORD_LENGTH } from '@/lib/security'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  
  const router = useRouter()
  const { signUp } = useAuth()

  const validateForm = () => {
    if (!name.trim()) {
      setError('Full name is required')
      return false
    }
    if (!email) {
      setError('Email is required')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      return false
    }
    if (!password) {
      setError('Password is required')
      return false
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return false
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
  
    if (!validateForm()) return
  
    setLoading(true)
    try {
      const { error, message } = await signUp(email, password, { name })
      
      if (error) {
        console.error('Signup error:', error)
        if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('already exists')) {
          setError('An account with this email already exists. Please log in.')
        } else {
          setError(error.message)
        }
      } else if (message) {
        setNotice(message)
      } else {
        router.push('/tenant-setup')
      }
      
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h2 className="text-2xl font-semibold text-foreground text-center">
        Create your account
      </h2>
      <p className="mt-2 text-center text-muted-foreground">
        Start tracking your projects professionally
      </p>

      <div className="mt-8 bg-card py-8 px-6 shadow-xl rounded-lg">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-md text-sm" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="bg-success/10 border border-success/30 text-success px-4 py-3 rounded-md text-sm" role="status">
              {notice}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
              Full Name
            </label>
            <div className="relative">
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="appearance-none relative block w-full px-3 py-3 pl-10 border border-input placeholder:text-muted-foreground text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                placeholder="Enter your full name"
                disabled={loading}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
              Email Address
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block w-full px-3 py-3 pl-10 border border-input placeholder:text-muted-foreground text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                placeholder="Enter your email"
                disabled={loading}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-3 pl-10 pr-10 border border-input placeholder:text-muted-foreground text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                placeholder={`Create a password (min ${MIN_PASSWORD_LENGTH} characters)`}
                autoComplete="new-password"
                disabled={loading}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-muted-foreground" />
              </div>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                disabled={loading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5 text-muted-foreground hover:text-muted-foreground" />
                ) : (
                  <Eye className="w-5 h-5 text-muted-foreground hover:text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-3 pl-10 border border-input placeholder:text-muted-foreground text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                placeholder="Confirm your password"
                disabled={loading}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center">
                <Loader2 className="animate-spin h-4 w-4 mr-2" />
                Creating Account...
              </div>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="text-primary hover:text-primary font-medium"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </>
  )
}