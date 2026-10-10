import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchUserProfileWithRoles, type UserWithDetails } from '../services/userService'
import type { RoleName } from '../types/database'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserWithDetails | null
  loading: boolean
  roles: RoleName[]
  isAdmin: boolean
  isStakePresidency: boolean
  isBishop: boolean
  isBranchPresident: boolean
  isYsaLeader: boolean
  isDeactivated: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserWithDetails | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      return
    }
    try {
      const details = await fetchUserProfileWithRoles(user.id)
      setProfile(details)
    } catch (err) {
      console.error('Error fetching user profile & roles:', err)
      setProfile(null)
    }
  }, [user])

  useEffect(() => {
    let mounted = true

    async function initializeSession() {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession()
        if (mounted) {
          setSession(initialSession)
          setUser(initialSession?.user ?? null)
          if (initialSession?.user) {
            const details = await fetchUserProfileWithRoles(initialSession.user.id)
            if (mounted) setProfile(details)
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initializeSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user ?? null)
      if (newSession?.user) {
        const details = await fetchUserProfileWithRoles(newSession.user.id)
        setProfile(details)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfile(null)
  }

  const roles = profile?.roles?.map((r) => r.role_name) || []
  const isDeactivated = profile?.account_status === 'deactivated'
  const isAccountActive = profile?.account_status === 'active'

  const isAdmin = isAccountActive && roles.includes('system_admin')
  const isStakePresidency = isAccountActive && roles.includes('stake_presidency')
  const isBishop = isAccountActive && roles.includes('bishop')
  const isBranchPresident = isAccountActive && roles.includes('branch_president')
  const isYsaLeader = isAccountActive && roles.includes('ysa_leader')

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        roles,
        isAdmin,
        isStakePresidency,
        isBishop,
        isBranchPresident,
        isYsaLeader,
        isDeactivated,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
