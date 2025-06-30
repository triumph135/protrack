'use client'

import { createContext, useContext, useEffect, useState } from 'react'
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
  const router = useRouter()
  const supabase = createClient()

  const fetchUserData = async (userId: string, fallbackEmail?: string): Promise<User | null> => {
    try {
      console.log('Fetching user data for ID:', userId)
      
      // First try to get user by ID
      let { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()  // Use maybeSingle() instead of single() to handle no results gracefully
  
      // If no user found by ID and we have an email, try by email
      if (!data && fallbackEmail) {
        console.log('User not found by ID, trying by email:', fallbackEmail)
        const { data: emailData, error: emailError } = await supabase
          .from('users')
          .select('*')
          .eq('email', fallbackEmail)
          .maybeSingle()
        
        data = emailData
        error = emailError
      }
  
      console.log('Database response:', { 
        hasData: !!data, 
        error: error?.message, 
        errorCode: error?.code 
      })
  
      if (error) {
        console.error('Error fetching user data:', error)
        return null
      }
  
      if (data) {
        console.log('User data fetched successfully:', data.email)
        console.log('User object details:', { 
          id: data.id, 
          email: data.email, 
          name: data.name, 
          role: data.role, 
          tenant_id: data.tenant_id 
        })
        const userData = data as User
        setUser(userData)
        console.log('User set in context:', userData.email)
        return userData
      }
      
      console.log('No user data found')
      return null
    } catch (error) {
      console.error('fetchUserData error:', error)
      return null
    }
  }

  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      // Only initialize once ever
      if (initialized) {
        console.log('Auth already initialized, skipping')
        return
      }
    
      try {
        console.log('Initializing auth...')
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
          console.log('Found existing session for:', session.user.email)
          setSupabaseUser(session.user)
          await fetchUserData(session.user.id, session.user.email) // Pass email as fallback
        } else {
          console.log('No existing session found')
          setSupabaseUser(null)
          setUser(null)
        }
    
        console.log('Auth initialization completed, setting loading to false')
        setLoading(false)
        setInitialized(true)
        setIsInitializing(false)
    
      } catch (error) {
        console.error('Error initializing auth:', error)
        if (mounted) {
          console.log('Auth initialization failed, setting loading to false')
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
      console.log('Auth state changed:', event, 'mounted:', mounted, 'initialized:', initialized, 'isProcessingAuth:', isProcessingAuth)
      
      if (!mounted) return
    
      // Prevent concurrent auth processing
      if (isProcessingAuth) {
        console.log('Auth processing already in progress, skipping event:', event)
        return
      }
    
      // Only handle explicit sign in/out events, not token refreshes or initial sessions during initialization
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        // Only skip SIGNED_IN events if initializeAuth is currently running
        if (event === 'SIGNED_IN' && isInitializing) {
          console.log('Skipping SIGNED_IN event during initializeAuth (to prevent duplicates)')
          return
        }
    
        setIsProcessingAuth(true)
        try {
          if (session?.user && event === 'SIGNED_IN') {
            console.log('User signed in:', session.user.email)
            setSupabaseUser(session.user)
            console.log('Starting fetchUserData with timeout protection...')
            
            // Add timeout protection to prevent infinite hanging
            const fetchWithTimeout = Promise.race([
              fetchUserData(session.user.id, session.user.email), // Pass email as fallback
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('fetchUserData timeout')), 10000)
              )
            ])
            
            await fetchWithTimeout
            console.log('fetchUserData completed successfully in auth state change')
          } else if (event === 'SIGNED_OUT') {
            console.log('User signed out')
            setSupabaseUser(null)
            setUser(null)
            // Reset initialized state so that next sign in will trigger initializeAuth
            setInitialized(false)
            console.log('Reset initialized state for next sign in')
          }
        } catch (error) {
          console.error('Error handling auth state change:', error)
          // If fetchUserData fails or times out, still set loading to false
          console.log('Continuing despite fetchUserData error...')
        } finally {
          setIsProcessingAuth(false)
        }
    
        console.log('Auth state change completed, setting loading to false')
        setLoading(false)
      } else {
        console.log('Ignoring auth event:', event, '(not a sign in/out)')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, []) // Empty dependency array - only run once

  const signIn = async (email: string, password: string) => {
    try {
      console.log('Starting sign in for:', email)
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

      console.log('Sign in successful')
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
      console.log('Starting signup for:', email)
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
        console.log('Creating user profile...')
        
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
  
        console.log('User profile created')
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
      console.log('Starting sign out...')
      setLoading(true)
      
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        console.error('Sign out error:', error)
      } else {
        console.log('Sign out successful')
      }
      
      // Clear local state immediately
      setUser(null)
      setSupabaseUser(null)
      
      // Navigate to login page
      console.log('Redirecting to login page...')
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