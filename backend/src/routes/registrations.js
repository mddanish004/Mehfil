import { Router } from 'express'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import {
  handleGetRegistrationTicket,
  handleManualCheckIn,
  handleVerifyRegistrationQr,
} from '../controllers/registration.controller.js'

const router = Router()

router.post('/verify-qr', requireAuth, handleVerifyRegistrationQr)
router.post('/:registrationId/checkin', requireAuth, handleManualCheckIn)
router.get('/:registrationId/ticket', optionalAuth, handleGetRegistrationTicket)

export default router
