import { Router } from 'express'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import {
  handleConfirmPayment,
  handleCreatePayment,
  handleRefundPayment,
} from '../controllers/payment.controller.js'

const router = Router()

router.post('/create', optionalAuth, handleCreatePayment)
router.post('/confirm', optionalAuth, handleConfirmPayment)
router.post('/:id/refund', requireAuth, handleRefundPayment)

export default router
