import { describe, it, expect, vi } from 'vitest'
import { assertEnvConfig } from '../lib/env'

describe('Environment Configuration & Secrets Validation', () => {
  it('throws a descriptive configuration error if VITE_SUPABASE_URL is missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    expect(() => assertEnvConfig()).toThrow(/VITE_SUPABASE_URL is missing/)
    vi.unstubAllEnvs()
  })

  it('ensures no service-role secrets are bundled into client-exposed environments', () => {
    const envVars = Object.keys(import.meta.env)
    const forbiddenPatterns = ['SERVICE_ROLE', 'SECRET_KEY', 'DB_PASS', 'SERVICE_KEY', 'DATABASE_URL']

    forbiddenPatterns.forEach((pattern) => {
      const found = envVars.filter((v) => v.toUpperCase().includes(pattern))
      expect(found).toHaveLength(0)
    })
  })
})
