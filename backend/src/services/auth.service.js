import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { and, desc, eq, gt } from 'drizzle-orm'
import { db } from '../config/db.js'
import {
  users,
  emailVerifications,
  refreshTokens,
  passwordResetTokens,
} from '../models/schema.js'
import env from '../config/env.js'
import {
  generateOTP,
  sendVerificationOTP,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from './email.service.js'
import {
  resendRegistrationOtp,
  verifyRegistrationEmailOtp,
} from './registration.service.js'

const SALT_ROUNDS = 12

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRY }
  )
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, tokenId: crypto.randomUUID() },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRY }
  )
}

function generateGuestToken(email) {
  return jwt.sign(
    { type: 'guest', email },
    env.JWT_SECRET,
    { expiresIn: '30d' }
  )
}

function setTokenCookies(res, accessToken, refreshToken) {
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  })

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

function clearTokenCookies(res) {
  res.clearCookie('access_token', { path: '/' })
  res.clearCookie('refresh_token', { path: '/' })
  res.clearCookie('guest_token', { path: '/' })
}

function createGuestSession(res, email) {
  const guestToken = generateGuestToken(email.toLowerCase())

  res.cookie('guest_token', guestToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  })

  return { guestToken }
}

function sanitizeUser(user) {
  const { passwordHash, ...safe } = user
  return safe
}

async function signup({ name, email, password }) {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  if (existing) {
    const err = new Error('An account with this email already exists')
    err.statusCode = 409
    throw err
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  const [user] = await db
    .insert(users)
    .values({
      name,
      email: email.toLowerCase(),
      passwordHash,
      authProvider: 'email',
    })
    .returning()

  const otp = generateOTP()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await db.insert(emailVerifications).values({
    email: email.toLowerCase(),
    purpose: 'account',
    otp,
    expiresAt,
  })

  await sendVerificationOTP(email.toLowerCase(), otp)

  return sanitizeUser(user)
}

async function login({ email, password }) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  if (!user) {
    const err = new Error('Invalid email or password')
    err.statusCode = 401
    throw err
  }

  if (user.authProvider === 'google' && !user.passwordHash) {
    const err = new Error('This account uses Google sign-in. Please log in with Google.')
    err.statusCode = 401
    throw err
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    const err = new Error('Invalid email or password')
    err.statusCode = 401
    throw err
  }

  if (!user.emailVerified) {
    const err = new Error('Please verify your email before logging in')
    err.statusCode = 403
    err.code = 'EMAIL_NOT_VERIFIED'
    throw err
  }

  return sanitizeUser(user)
}

async function createSession(res, user) {
  const accessToken = generateAccessToken(user)
  const refreshToken = generateRefreshToken(user)

  await db.insert(refreshTokens).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  })

  setTokenCookies(res, accessToken, refreshToken)

  return { accessToken, refreshToken }
}

async function refreshSession(res, token) {
  let payload
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET)
  } catch {
    const err = new Error('Invalid or expired refresh token')
    err.statusCode = 401
    throw err
  }

  const [storedToken] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.token, token),
        gt(refreshTokens.expiresAt, new Date())
      )
    )
    .limit(1)

  if (!storedToken) {
    const err = new Error('Refresh token not found or expired')
    err.statusCode = 401
    throw err
  }

  await db.delete(refreshTokens).where(eq(refreshTokens.token, token))

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1)

  if (!user) {
    const err = new Error('User not found')
    err.statusCode = 401
    throw err
  }

  return createSession(res, user)
}

async function logout(res, refreshToken) {
  clearTokenCookies(res)
  if (refreshToken) {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken))
  }
}

async function verifyEmail({ email, otp, purpose = 'account', shortId }) {
  if (purpose === 'event_registration') {
    if (!shortId) {
      const err = new Error('Event shortId is required for registration verification')
      err.statusCode = 400
      throw err
    }

    const result = await verifyRegistrationEmailOtp({ shortId, email, otp })
    return {
      type: 'event_registration',
      ...result,
    }
  }

  const [verification] = await db
    .select()
    .from(emailVerifications)
    .where(
      and(
        eq(emailVerifications.email, email.toLowerCase()),
        eq(emailVerifications.purpose, 'account'),
        eq(emailVerifications.verified, false),
        gt(emailVerifications.expiresAt, new Date())
      )
    )
    .orderBy(desc(emailVerifications.createdAt))
    .limit(1)

  if (!verification) {
    const err = new Error('No pending verification found or OTP expired')
    err.statusCode = 400
    throw err
  }

  if (verification.attempts >= 5) {
    const err = new Error('Too many failed attempts. Request a new OTP.')
    err.statusCode = 429
    throw err
  }

  if (verification.otp !== otp) {
    await db
      .update(emailVerifications)
      .set({ attempts: verification.attempts + 1 })
      .where(eq(emailVerifications.id, verification.id))

    const err = new Error('Invalid OTP')
    err.statusCode = 400
    throw err
  }

  await db
    .update(emailVerifications)
    .set({ verified: true })
    .where(eq(emailVerifications.id, verification.id))

  const [user] = await db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.email, email.toLowerCase()))
    .returning()

  if (!user) {
    const err = new Error('User not found for this email')
    err.statusCode = 404
    throw err
  }

  await sendWelcomeEmail(user.email, user.name)

  return {
    type: 'account',
    user: sanitizeUser(user),
  }
}

async function resendOTP({ email, purpose = 'account', shortId }) {
  if (purpose === 'event_registration') {
    if (!shortId) {
      const err = new Error('Event shortId is required for registration OTP resend')
      err.statusCode = 400
      throw err
    }

    return resendRegistrationOtp({ shortId, email })
  }

  const recentCount = await db
    .select()
    .from(emailVerifications)
    .where(
      and(
        eq(emailVerifications.email, email.toLowerCase()),
        eq(emailVerifications.purpose, 'account'),
        gt(emailVerifications.createdAt, new Date(Date.now() - 10 * 60 * 1000))
      )
    )

  if (recentCount.length >= 3) {
    const err = new Error('Too many OTP requests. Please wait before trying again.')
    err.statusCode = 429
    throw err
  }

  const otp = generateOTP()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await db.insert(emailVerifications).values({
    email: email.toLowerCase(),
    purpose: 'account',
    otp,
    expiresAt,
  })

  await sendVerificationOTP(email.toLowerCase(), otp)

  return { message: 'OTP sent successfully' }
}

async function forgotPassword(email) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  if (!user) {
    return { message: 'If an account exists with that email, a reset link has been sent.' }
  }

  if (user.authProvider === 'google' && !user.passwordHash) {
    return { message: 'If an account exists with that email, a reset link has been sent.' }
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    token,
    expiresAt,
  })

  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${token}`
  await sendPasswordResetEmail(user.email, resetUrl)

  return { message: 'If an account exists with that email, a reset link has been sent.' }
}

async function resetPassword({ token, password }) {
  const [resetToken] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, token),
        eq(passwordResetTokens.used, false),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1)

  if (!resetToken) {
    const err = new Error('Invalid or expired reset token')
    err.statusCode = 400
    throw err
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  await db
    .update(users)
    .set({ passwordHash, emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, resetToken.userId))

  await db
    .update(passwordResetTokens)
    .set({ used: true })
    .where(eq(passwordResetTokens.id, resetToken.id))

  await db
    .delete(refreshTokens)
    .where(eq(refreshTokens.userId, resetToken.userId))

  return { message: 'Password reset successfully' }
}

async function getMe(userId) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    const err = new Error('User not found')
    err.statusCode = 404
    throw err
  }

  return sanitizeUser(user)
}

export {
  signup,
  login,
  createSession,
  createGuestSession,
  refreshSession,
  logout,
  verifyEmail,
  resendOTP,
  forgotPassword,
  resetPassword,
  getMe,
  sanitizeUser,
}
