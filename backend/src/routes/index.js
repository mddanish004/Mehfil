import { Router } from 'express'
import healthRouter from './health.js'
import authRouter from './auth.js'

const router = Router()

router.use('/health', healthRouter)
router.use('/auth', authRouter)

export default router
