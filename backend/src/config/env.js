import dotenv from 'dotenv'

dotenv.config()

const env = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_EVENT_IMAGES_BUCKET: process.env.SUPABASE_EVENT_IMAGES_BUCKET || 'event-images',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret-change-in-production',
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
  ZOOM_ACCOUNT_ID: process.env.ZOOM_ACCOUNT_ID,
  ZOOM_CLIENT_ID: process.env.ZOOM_CLIENT_ID,
  ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET,
  ZOOM_USER_ID: process.env.ZOOM_USER_ID || 'me',
  OSM_NOMINATIM_BASE_URL: process.env.OSM_NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org',
  OSM_PHOTON_BASE_URL: process.env.OSM_PHOTON_BASE_URL || 'https://photon.komoot.io',
  OSM_USER_AGENT: process.env.OSM_USER_AGENT || 'mehfil/1.0 (opensource@example.com)',
  OSM_CONTACT_EMAIL: process.env.OSM_CONTACT_EMAIL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM || 'Mehfil <onboarding@resend.dev>',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
}

const requiredVars = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']

if (env.NODE_ENV === 'production') {
  const prodVars = [...requiredVars, 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'RESEND_API_KEY']
  for (const varName of prodVars) {
    if (!env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`)
    }
  }
}

export default env
