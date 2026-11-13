'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { User } from '@/types/app.types'
import { ENTRY_PERMISSIONS, PUBLIC_USER_COLUMNS } from '@/lib/permissions'
import { isMissingColumnError, presentAuthError } from '@/lib/security'

type AuthContextType = {
  supabaseUser: SupabaseUser | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (
    email: string,
    password: string,
    userData: { name: string }
  ) => Promise<{ error: Error | null; message?: string }>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [isProcessingAuth, setIsProcessingAuth] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  
  // Use refs to store current state values to avoid stale closures
  const initializedRef = useRef(false)
  const userRef = useRef<User | null>(null)
  const isProcessingAuthRef = useRef(false)
  const isInitializingRef = useRef(false)
  
  // Update refs whenever state changes
  useEffect(() => {
    initializedRef.current = initialized
  }, [initialized])
  
  useEffect(() => {
    userRef.current = user
  }, [user])
  
  useEffect(() => {
    isProcessingAuthRef.current = isProcessingAuth
  }, [isProcessingAuth])
  
  useEffect(() => {
    isInitializingRef.current = isInitializing
  }, [isInitializing])

  const router = useRouter()
  const supabase = createClient()

  const loadProfile = async (
    userId: string,
    fallbackEmail?: string | null
  ): Promise<{ user: User | null; error: string | null }> => {
    const columnLists = [PUBLIC_USER_COLUMNS, 'id, tenant_id, name, email, role, permissions']

    const query = async (columns: string, field: 'id' | 'email', value: string) => {
      const { data, error } = await supabase
        .from('users')
        .select(columns)
        .eq(field, value)
        .maybeSingle()
      return { user: (data as User | null) ?? null, error }
    }

    try {
      let idResult: { user: User | null; error: { code?: string; message?: string } | null } = {
        user: null,
        error: null,
      }
      for (const columns of columnLists) {
        idResult = await query(columns, 'id', userId)
        if (!idResult.error) break
        if (!isMissingColumnError(idResult.error)) break
      }

      if (idResult.error) {
        console.error('Error fetching user data:', idResult.error)
        return { user: null, error: `Could not load the account profile: ${idResult.error.message}` }
      }
      if (idResult.user) {
        setUser(idResult.user)
        return { user: idResult.user, error: null }
      }

      // Legacy profiles were sometimes created before the auth user id existed.
      // Match only the email on the signed-in account, never an address typed
      // into the form, and only when that email belongs to exactly one row.
      const email = fallbackEmail?.trim()
      if (!email) return { user: null, error: null }

      let emailResult: { user: User | null; error: { code?: string; message?: string } | null } = {
        user: null,
        error: null,
      }
      for (const columns of columnLists) {
        emailResult = await query(columns, 'email', email)
        if (!emailResult.error) break
        if (!isMissingColumnError(emailResult.error)) break
      }

      if (emailResult.error) {
        console.error('Error fetching user by email:', emailResult.error)
        return { user: null, error: `Could not load the account profile: ${emailResult.error.message}` }
      }

      const match = emailResult.user
      if (!match || match.email?.trim().toLowerCase() !== email.toLowerCase()) {
        return { user: null, error: null }
      }

      setUser(match)
      return { user: match, error: null }
    } catch (error) {
      console.error('fetchUserData error:', error)
      return { user: null, error: error instanceof Error ? error.message : 'Could not load the account profile.' }
    }
  }

  const fetchUserData = async (userId: string, fallbackEmail?: string | null): Promise<User | null> => {
    const result = await loadProfile(userId, fallbackEmail)
    return result.user
  }

  useEffect(() => {
    let mounted = true
    let lastEventTime = 0
    const eventCooldown = 2000 // 2 seconds cooldown between processing same events

    const initializeAuth = async () => {
      // Only initialize once ever
      if (initializedRef.current) {
        return
      }
    
      try {
        setIsInitializing(true)
        
        // Get initial session
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (!mounted) return
    
        if (error) {
          console.error('Error getting session:', error)
          setLoading(false)
          setInitialized(true)
          return
        }
    
        if (session?.user) {
          setSupabaseUser(session.user)
          await fetchUserData(session.user.id, session.user.email)
        } else {
          setSupabaseUser(null)
          setUser(null)
        }
    
        setLoading(false)
        setInitialized(true)
        setIsInitializing(false)
    
      } catch (error) {
        console.error('Error initializing auth:', error)
        if (mounted) {
          setLoading(false)
          setInitialized(true)
          setIsInitializing(false)
        }
      }
    }

    // Initialize auth
    initializeAuth()

    // Set up auth state listener - but only for actual sign in/out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
    
      // Prevent processing when page is not visible (user navigated away)
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }

      // Add cooldown to prevent rapid-fire events
      const now = Date.now()
      if (event === 'SIGNED_IN' && now - lastEventTime < eventCooldown) {
        return
      }
      lastEventTime = now

      // Skip processing if we're already initialized and this is likely a token refresh
      if (initializedRef.current && event === 'SIGNED_IN' && userRef.current && session?.user) {
        // Just silently update the supabase user without re-fetching
        setSupabaseUser(session.user)
        return
      }

      // Handle token refresh events explicitly
      if (event === 'TOKEN_REFRESHED' && session?.user) {
        setSupabaseUser(session.user)
        return
      }
    
      // Prevent concurrent auth processing
      if (isProcessingAuthRef.current) {
        return
      }
    
      // Only handle explicit sign out events and initial sign in (not token refreshes)
      if (event === 'SIGNED_OUT') {
        setIsProcessingAuth(true)
        try {
          setSupabaseUser(null)
          setUser(null)
          // Reset initialized state so that next sign in will trigger initializeAuth
          setInitialized(false)
          setLoading(false)
        } finally {
          setIsProcessingAuth(false)
        }
      } else if (event === 'SIGNED_IN' && !userRef.current) {
        // Handle SIGNED_IN events whenever we don't already have a loaded
        // profile for the current user. Gating this on `!initializedRef.current`
        // (the old condition) meant a *real* sign-in from the login form was
        // silently ignored, because initializeAuth() has almost always already
        // finished (and set initialized=true) by the time a human finishes
        // typing a password and clicking submit. That left `loading` stuck at
        // true and `user` stuck at null forever after a correct login, so the
        // UI just spun on "Signing In..." until the user manually refreshed
        // the page (which re-ran initializeAuth from scratch and worked).
        setIsProcessingAuth(true)
        try {
          if (session?.user) {
            setSupabaseUser(session.user)
            
            // Add timeout protection to prevent infinite hanging
            const fetchWithTimeout = Promise.race([
              fetchUserData(session.user.id, session.user.email),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('fetchUserData timeout')), 15000)
              )
            ])
            
            await fetchWithTimeout
          }
          setLoading(false)
        } catch (error) {
          console.error('Error handling auth state change:', error)
          // If fetchUserData fails or times out, don't clear user data if we already have it
          // This prevents breaking the app state on temporary network issues
          if (!userRef.current && session?.user) {
            // Only set supabaseUser if we don't have user data yet
            setSupabaseUser(session.user)
          }
          setLoading(false)
        } finally {
          setIsProcessingAuth(false)
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, []) // Empty dependency array - only run once

  const authError = (error: { message?: string } | null) =>
    new Error(presentAuthError(error?.message, process.env.NEXT_PUBLIC_SUPABASE_URL))

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('Sign in error:', error)
        return { error: authError(error) }
      }

      const authUser = data.user
      if (!authUser) {
        return { error: new Error('Sign-in did not return an account.') }
      }

      const profile = await loadProfile(authUser.id, authUser.email)
      if (profile.error || !profile.user) {
        await supabase.auth.signOut()
        return {
          error: new Error(
            profile.error ||
              `Signed in, but no ProTrack profile is linked to ${authUser.email || 'this account'}.`
          ),
        }
      }

      return { error: null }
    } catch (error) {
      console.error('Sign in failed:', error)
      return { error: authError(error as Error) }
    }
  }

  const signUp = async (email: string, password: string, userData: { name: string }) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: userData.name },
        },
      })

      if (error) {
        console.error('Signup error:', error)
        return { error: authError(error) }
      }

      if (!data.user) {
        return { error: new Error('Sign-up did not return an account.') }
      }

      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: data.user.id,
          email: email,
          name: userData.name,
          role: 'entry',
          tenant_id: null,
          permissions: ENTRY_PERMISSIONS
        })

      // A second attempt can hit the row created by the first.
      if (profileError && profileError.code !== '23505') {
        console.error('Profile creation error:', profileError)
        await supabase.auth.signOut()
        return { error: new Error(`Failed to create profile: ${profileError.message}`) }
      }

      if (!data.session) {
        return {
          error: null,
          message:
            'Account created. Check your email for a confirmation link, then sign in.',
        }
      }

      const profile = await loadProfile(data.user.id, data.user.email || email)
      if (profile.error || !profile.user) {
        return {
          error: new Error(profile.error || 'Account created, but the profile could not be loaded.'),
        }
      }

      return { error: null }
    } catch (error) {
      console.error('Signup failed:', error)
      return { error: authError(error as Error) }
    }
  }

  const signOut = async () => {
    try {
      setLoading(true)
      
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        console.error('Sign out error:', error)
      }
      
      // Clear local state immediately
      setUser(null)
      setSupabaseUser(null)
      
      // Navigate to login page
      router.push('/login')
      
    } catch (error) {
      console.error('Sign out failed:', error)
    } finally {
      // Always set loading to false
      setLoading(false)
    }
  }

  const refreshUser = async () => {
    if (supabaseUser) {
      await fetchUserData(supabaseUser.id, supabaseUser.email)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        supabaseUser,
        user,
        loading,
        signIn,
        signUp,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}