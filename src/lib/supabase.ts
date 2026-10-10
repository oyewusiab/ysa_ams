import { createClient } from '@supabase/supabase-js'
import { envConfig } from './env'

// Initial client using public environment variables.
// NOTE: Only publishable/anon keys are ever used in frontend code.
export const supabase = createClient(
  envConfig.supabaseUrl || 'https://pueehzvrdlaybrnnzakg.supabase.co',
  envConfig.supabaseAnonKey || 'placeholder-anon-key'
)
