'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { User } from '@/types/app.types'

type AuthContextType = {
  supabaseUser: SupabaseUser | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, userData: { name: string }) => Promise<{ error: Error | null }>
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

  const fetchUserData = async (userId: string, fallbackEmail?: string): Promise<User | null> => {
    try {
      // First try to get user by ID
      let { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()  // Use maybeSingle() instead of single() to handle no results gracefully
  
      // If no user found by ID and we have an email, try by email
      if (!data && fallbackEmail) {
        const { data: emailData, error: emailError } = await supabase
          .from('users')
          .select('*')
          .eq('email', fallbackEmail)
          .maybeSingle()
        
        data = emailData
        error = emailError
      }
  
      if (error) {
        console.error('Error fetching user data:', error)
        return null
      }
  
      if (data) {
        const userData = data as User
        setUser(userData)
        return userData
      }
      
      return null
    } catch (error) {
      console.error('fetchUserData error:', error)
      return null
    }
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
          await fetchUserData(session.user.id, session.user.email) // Pass email as fallback
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
      } else if (event === 'SIGNED_IN' && !initializedRef.current && !isInitializingRef.current) {
        // Only handle SIGNED_IN events when we're not already initialized
        // This prevents token refresh events from triggering re-authentication
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

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true)
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('Sign in error:', error)
        setLoading(false)
        return { error }
      }

      // Don't set loading to false here - let the auth state change handle it
      return { error: null }
    } catch (error) {
      console.error('Sign in failed:', error)
      setLoading(false)
      return { error: error as Error }
    }
  }

  const signUp = async (email: string, password: string, userData: { name: string }) => {
    try {
      setLoading(true)
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })
  
      if (error) {
        console.error('Signup error:', error)
        setLoading(false)
        return { error }
      }
  
      if (data.user) {
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            id: data.user.id,
            email: email,
            name: userData.name,
            role: 'entry',
            tenant_id: null,
            permissions: {
              material: 'read',
              labor: 'read',
              equipment: 'read',
              subcontractor: 'read',
              others: 'read',
              capLeases: 'read',
              consumable: 'read',
              invoices: 'read',
              projects: 'read',
              users: 'none'
            }
          })
  
        if (profileError) {
          console.error('Profile creation error:', profileError)
          await supabase.auth.signOut()
          setLoading(false)
          return { error: new Error(`Failed to create profile: ${profileError.message}`) }
        }
      }
  
      setLoading(false)
      return { error: null }
    } catch (error) {
      console.error('Signup failed:', error)
      setLoading(false)
      return { error: error as Error }
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
      await fetchUserData(supabaseUser.id)
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