import {
  signup,
  login,
  createSession,
  refreshSession,
  logout,
  verifyEmail,
  resendOTP,
  forgotPassword,
  resetPassword,
  getMe,
  sanitizeUser,
} from '../services/auth.service.js'

async function handleSignup(req, res, next) {
  try {
    const { name, email, password } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: { message: 'Name, email, and password are required' },
      })
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: { message: 'Password must be at least 8 characters' },
      })
    }

    const user = await signup({ name, email, password })

    res.status(201).json({
      success: true,
      data: { user },
      message: 'Account created. Please verify your email.',
    })
  } catch (error) {
    next(error)
  }
}

async function handleLogin(req, res, next) {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email and password are required' },
      })
    }

    const user = await login({ email, password })
    await createSession(res, user)

    res.json({
      success: true,
      data: { user },
      message: 'Logged in successfully',
    })
  } catch (error) {
    next(error)
  }
}

async function handleLogout(req, res, next) {
  try {
    const refreshToken = req.cookies?.refresh_token
    await logout(res, refreshToken)

    res.json({
      success: true,
      message: 'Logged out successfully',
    })
  } catch (error) {
    next(error)
  }
}

async function handleRefresh(req, res, next) {
  try {
    const token = req.cookies?.refresh_token

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { message: 'No refresh token provided' },
      })
    }

    await refreshSession(res, token)

    res.json({
      success: true,
      message: 'Token refreshed successfully',
    })
  } catch (error) {
    next(error)
  }
}

async function handleVerifyEmail(req, res, next) {
  try {
    const { email, otp } = req.body

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email and OTP are required' },
      })
    }

    const user = await verifyEmail({ email, otp })
    await createSession(res, user)

    res.json({
      success: true,
      data: { user },
      message: 'Email verified successfully',
    })
  } catch (error) {
    next(error)
  }
}

async function handleResendOTP(req, res, next) {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email is required' },
      })
    }

    const result = await resendOTP(email)

    res.json({
      success: true,
      message: result.message,
    })
  } catch (error) {
    next(error)
  }
}

async function handleForgotPassword(req, res, next) {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email is required' },
      })
    }

    const result = await forgotPassword(email)

    res.json({
      success: true,
      message: result.message,
    })
  } catch (error) {
    next(error)
  }
}

async function handleResetPassword(req, res, next) {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: { message: 'Token and new password are required' },
      })
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: { message: 'Password must be at least 8 characters' },
      })
    }

    const result = await resetPassword({ token, password })

    res.json({
      success: true,
      message: result.message,
    })
  } catch (error) {
    next(error)
  }
}

async function handleGoogleCallback(req, res, next) {
  try {
    const user = req.user
    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=google_failed`)
    }

    await createSession(res, user)
    res.redirect(process.env.CLIENT_URL || 'http://localhost:5173')
  } catch (error) {
    next(error)
  }
}

async function handleGetMe(req, res, next) {
  try {
    const user = await getMe(req.user.id)

    res.json({
      success: true,
      data: { user },
    })
  } catch (error) {
    next(error)
  }
}

export {
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
}
