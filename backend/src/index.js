import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import passport from './config/passport.js'
import env from './config/env.js'
import routes from './routes/index.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

const app = express()

app.use(helmet())

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

app.use(cookieParser())
app.use(passport.initialize())

const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many requests, please try again later.' },
  },
})
app.use('/api', limiter)

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.NODE_ENV === 'production' ? 10 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many authentication attempts, please try again later.' },
  },
})
app.use('/api/auth', authLimiter)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.use('/api', routes)

app.use(notFoundHandler)
app.use(errorHandler)

const PORT = env.PORT

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Environment: ${env.NODE_ENV}`)
  console.log(`Health check: http://localhost:${PORT}/api/health`)
})

export default app
