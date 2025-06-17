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
  const router = useRouter()
  const supabase = createClient()

  const fetchUserData = async (userId: string): Promise<User | null> => {
    try {
      console.log('Fetching user data for ID:', userId)
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      console.log('Database response:', { data: !!data, error: error?.message, errorCode: error?.code })

      if (error) {
        console.error('Error fetching user data:', error)
        if (error.code === 'PGRST116') {
          console.log('User profile not found in database')
        }
        return null
      }

      if (data) {
        console.log('User data fetched successfully:', data.email)
        console.log('Setting user in context...')
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
      
      return null
    } catch (error) {
      console.error('fetchUserData error:', error)
      return null
    }
  }

  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      try {
        console.log('Initializing auth...')
        
        // Set a timeout to ensure loading doesn't get stuck
        const timeoutId = setTimeout(() => {
          if (mounted) {
            console.log('Auth initialization timeout - setting loading to false')
            setLoading(false)
            setInitialized(true)
          }
        }, 5000) // 5 second timeout

        // Get initial session
        const { data: { session }, error } = await supabase.auth.getSession()
        
        // Clear the timeout since we got a response
        clearTimeout(timeoutId)
        
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
          await fetchUserData(session.user.id)
        } else {
          console.log('No existing session found')
          setSupabaseUser(null)
          setUser(null)
        }

        setLoading(false)
        setInitialized(true)

      } catch (error) {
        console.error('Error initializing auth:', error)
        if (mounted) {
          setLoading(false)
          setInitialized(true)
        }
      }
    }

    // Only initialize once
    if (!initialized) {
      initializeAuth()
    }

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event)
      
      if (!mounted) return

      try {
        if (session?.user) {
          console.log('User signed in:', session.user.email)
          setSupabaseUser(session.user)
          await fetchUserData(session.user.id)
        } else {
          console.log('User signed out')
          setSupabaseUser(null)
          setUser(null)
        }
      } catch (error) {
        console.error('Error handling auth state change:', error)
      }

      // Always ensure loading is false after auth state change
      if (initialized) {
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [initialized]) // Only depend on initialized

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