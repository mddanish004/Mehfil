import { Router } from 'express'
import healthRouter from './health.js'
import authRouter from './auth.js'
import eventsRouter from './events.js'
import registrationsRouter from './registrations.js'
import paymentsRouter from './payments.js'

const router = Router()

router.use('/health', healthRouter)
router.use('/auth', authRouter)
router.use('/events', eventsRouter)
router.use('/registrations', registrationsRouter)
router.use('/payments', paymentsRouter)

export default router
