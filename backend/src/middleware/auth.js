import jwt from 'jsonwebtoken'
import env from '../config/env.js'

function parseGuestToken(token) {
  if (!token) {
    return null
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET)
    if (payload?.type === 'guest' && typeof payload.email === 'string') {
      return { email: payload.email.toLowerCase() }
    }
  } catch {
  }

  return null
}

function requireAuth(req, res, next) {
  const token = req.cookies?.access_token

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authentication required' },
    })
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET)
    req.user = { id: payload.userId, email: payload.email }
    next()
  } catch {
    return res.status(401).json({
      success: false,
      error: { message: 'Invalid or expired token' },
    })
  }
}

function optionalAuth(req, _res, next) {
  const token = req.cookies?.access_token
  if (!token) {
    req.guest = parseGuestToken(req.cookies?.guest_token)
    return next()
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET)
    req.user = { id: payload.userId, email: payload.email }
  } catch {
  }
  req.guest = parseGuestToken(req.cookies?.guest_token)
  next()
}

export { requireAuth, optionalAuth }
