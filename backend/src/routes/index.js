import { Router } from 'express'
import healthRouter from './health.js'
import authRouter from './auth.js'
import eventsRouter from './events.js'
import registrationsRouter from './registrations.js'

const router = Router()

router.use('/health', healthRouter)
router.use('/auth', authRouter)
router.use('/events', eventsRouter)
router.use('/registrations', registrationsRouter)

export default router
