import { createClient } from '@supabase/supabase-js'
import env from './env.js'

const supabaseUrl = env.SUPABASE_URL
const supabaseAnonKey = env.SUPABASE_ANON_KEY

let supabase = null

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey)
} else {
  console.warn('⚠️  Supabase credentials not set. Supabase client unavailable.')
}

export default supabase
