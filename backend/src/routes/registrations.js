import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import { handleGetRegistrationTicket } from '../controllers/registration.controller.js'

const router = Router()

router.get('/:registrationId/ticket', optionalAuth, handleGetRegistrationTicket)

export default router
