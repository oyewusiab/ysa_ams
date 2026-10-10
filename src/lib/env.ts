/**
 * Environment Configuration Module
 * Strictly validates environment variables and provides fail-fast diagnostics.
 */

interface EnvConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  isConfigured: boolean
}

function getEnvConfig(): EnvConfig {
  const url = import.meta.env.VITE_SUPABASE_URL || ''
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

  const isConfigured = 
    Boolean(url) && 
    Boolean(anonKey) && 
    !anonKey.includes('your-supabase-publishable') &&
    !anonKey.includes('placeholder-anon-key')

  return {
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    isConfigured,
  }
}

export const envConfig = getEnvConfig()

export function assertEnvConfig(customUrl?: string, customKey?: string): void {
  const url = customUrl !== undefined ? customUrl : (import.meta.env.VITE_SUPABASE_URL || '')
  const key = customKey !== undefined ? customKey : (import.meta.env.VITE_SUPABASE_ANON_KEY || '')

  if (!url) {
    throw new Error('Configuration Error: VITE_SUPABASE_URL is missing. Please check your .env configuration.')
  }
  if (!key) {
    throw new Error('Configuration Error: VITE_SUPABASE_ANON_KEY is missing. Please check your .env configuration.')
  }
}
