import { createClient } from '@supabase/supabase-js'
import env from './env.js'

const supabaseUrl = env.SUPABASE_URL
const supabaseAnonKey = env.SUPABASE_ANON_KEY
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

let supabase = null
let supabaseService = null

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey)
} else {
  console.warn('⚠️  Supabase credentials not set. Supabase client unavailable.')
}

if (supabaseUrl && supabaseServiceRoleKey) {
  supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export { supabaseService }
export default supabase
