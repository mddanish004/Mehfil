import { Router } from 'express'
import passport from '../config/passport.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import {
  handleSignup,
  handleLogin,
  handleLogout,
  handleRefresh,
  handleVerifyEmail,
  handleResendOTP,
  handleForgotPassword,
  handleResetPassword,
  handleGoogleCallback,
  handleGetMe,
  handleGetGuestProfile,
} from '../controllers/auth.controller.js'

const router = Router()

router.post('/signup', handleSignup)
router.post('/login', handleLogin)
router.post('/logout', handleLogout)
router.post('/refresh', handleRefresh)
router.post('/verify-email', handleVerifyEmail)
router.post('/resend-otp', handleResendOTP)
router.post('/forgot-password', handleForgotPassword)
router.post('/reset-password', handleResetPassword)
router.get('/me', requireAuth, handleGetMe)
router.get('/guest-profile', optionalAuth, handleGetGuestProfile)

router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
)

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=google_failed' }),
  handleGoogleCallback
)

export default router
