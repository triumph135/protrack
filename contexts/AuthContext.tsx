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
  const router = useRouter()
  const supabase = createClient()

  const fetchUserData = async (userId: string) => {
    console.log('Fetching user data for ID:', userId)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    console.log('User data fetch result:', { data: !!data, error: !!error })

    if (error) {
      console.error('Error fetching user data:', error)
      throw error
    }

    if (data) {
      console.log('Setting user data:', data)
      setUser(data as User)
    }
    return data
  }

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setSupabaseUser(session?.user ?? null)
        
        if (session?.user) {
          await fetchUserData(session.user.id)
        }
      } catch (error) {
        console.error('Error checking session:', error)
      } finally {
        setLoading(false)
      }
    }

    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id)
      setSupabaseUser(session?.user ?? null)
      
      if (session?.user) {
        try {
          await fetchUserData(session.user.id)
        } catch (error) {
          console.error('Failed to fetch user data after auth state change:', error)
          setUser(null)
        }
      } else {
        setUser(null)
      }
      
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase, router])

  const signIn = async (email: string, password: string) => {
    try {
      console.log('Starting sign in process...')
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log('Auth response:', { data: !!data, error: !!error })

      if (error) throw error

      if (data.user) {
        console.log('User authenticated, fetching profile...')
        try {
          await fetchUserData(data.user.id)
          console.log('User profile loaded successfully')
        } catch (fetchError) {
          console.error('Failed to fetch user profile:', fetchError)
          // Sign out the user since we can't load their profile
          await supabase.auth.signOut()
          throw new Error('Failed to load user profile. Please contact support.')
        }
      }

      console.log('Sign in completed successfully')
      return { error: null }
    } catch (error) {
      console.error('Sign in error:', error)
      return { error: error as Error }
    }
  }

  const signUp = async (email: string, password: string, userData: { name: string }) => {
    try {
      console.log('Starting signup process with:', { email, name: userData.name })
      
      // First create the auth user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })
  
      if (error) {
        console.error('Supabase auth signup error:', error)
        throw error
      }
  
      console.log('Auth user created:', data.user?.id)
  
      if (data.user) {
        console.log('Creating user profile in database...')
        
        // Create user profile in the database
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
          console.error('User profile creation error:', profileError)
          // If profile creation fails, delete the auth user to maintain consistency
          await supabase.auth.signOut()
          throw new Error(`Failed to create user profile: ${profileError.message}`)
        }
  
        console.log('User profile created successfully')
        
        // Fetch the created user data to set in state
        try {
          await fetchUserData(data.user.id)
          console.log('User data fetched and set in context')
        } catch (fetchError) {
          console.error('Error fetching user data after creation:', fetchError)
          // Don't throw here since the user was created successfully
          // The middleware will still redirect properly
        }
      }
  
      console.log('Signup process completed successfully')
      return { error: null }
    } catch (error) {
      console.error('Signup process failed:', error)
      return { error: error as Error }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
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