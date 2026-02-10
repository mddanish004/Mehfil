import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { eq } from 'drizzle-orm'
import { db } from './db.js'
import { users } from '../models/schema.js'
import env from './env.js'

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value
          if (!email) {
            return done(new Error('No email found in Google profile'), null)
          }

          const [existingUser] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1)

          if (existingUser) {
            if (existingUser.authProvider === 'email' && !existingUser.emailVerified) {
              await db
                .update(users)
                .set({
                  emailVerified: true,
                  authProvider: 'google',
                  avatarUrl: existingUser.avatarUrl || profile.photos?.[0]?.value,
                  updatedAt: new Date(),
                })
                .where(eq(users.id, existingUser.id))
            }
            return done(null, existingUser)
          }

          const [newUser] = await db
            .insert(users)
            .values({
              email,
              name: profile.displayName || email.split('@')[0],
              authProvider: 'google',
              emailVerified: true,
              avatarUrl: profile.photos?.[0]?.value,
            })
            .returning()

          return done(null, newUser)
        } catch (error) {
          return done(error, null)
        }
      }
    )
  )
}

passport.serializeUser((user, done) => {
  done(null, user.id)
})

passport.deserializeUser(async (id, done) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    done(null, user || null)
  } catch (error) {
    done(error, null)
  }
})

export default passport
