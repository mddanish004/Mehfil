import jwt from 'jsonwebtoken'
import env from '../config/env.js'

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
    return next()
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET)
    req.user = { id: payload.userId, email: payload.email }
  } catch {
  }
  next()
}

export { requireAuth, optionalAuth }
