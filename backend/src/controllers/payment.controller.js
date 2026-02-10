import { ZodError, z } from 'zod'
import {
  confirmPaymentForRegistration,
  createPaymentForRegistration,
  processPaymentWebhook,
  refundPaymentById,
} from '../services/payment.service.js'

const createPaymentSchema = z
  .object({
    registrationId: z.string().uuid(),
  })
  .strict()

const confirmPaymentSchema = z
  .object({
    registrationId: z.string().uuid(),
    paymentId: z.string().trim().min(1).max(255).optional(),
    checkoutSessionId: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.paymentId && !data.checkoutSessionId) {
      return
    }

    if (data.paymentId && data.checkoutSessionId && data.paymentId === data.checkoutSessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'paymentId and checkoutSessionId should not be identical',
        path: ['paymentId'],
      })
    }
  })

const refundParamsSchema = z.object({
  id: z.string().uuid(),
})

const refundBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(3000).optional(),
  })
  .strict()

function parseSchema(schema, payload) {
  try {
    return schema.parse(payload)
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0]
      const err = new Error(issue?.message || 'Validation failed')
      err.statusCode = 400
      err.code = 'VALIDATION_ERROR'
      err.details = error.flatten()
      throw err
    }

    throw error
  }
}

async function handleCreatePayment(req, res, next) {
  try {
    const { registrationId } = parseSchema(createPaymentSchema, req.body || {})

    const result = await createPaymentForRegistration({
      registrationId,
      viewer: {
        userId: req.user?.id || null,
        email: req.guest?.email || req.user?.email || null,
      },
    })

    return res.status(201).json({
      success: true,
      data: result,
      message: result.alreadyPaid ? 'Payment already completed' : 'Payment session created',
    })
  } catch (error) {
    return next(error)
  }
}

async function handleConfirmPayment(req, res, next) {
  try {
    const payload = parseSchema(confirmPaymentSchema, req.body || {})

    const result = await confirmPaymentForRegistration({
      registrationId: payload.registrationId,
      paymentId: payload.paymentId || null,
      checkoutSessionId: payload.checkoutSessionId || null,
      viewer: {
        userId: req.user?.id || null,
        email: req.guest?.email || req.user?.email || null,
      },
    })

    return res.json({
      success: true,
      data: result,
      message: 'Payment status checked',
    })
  } catch (error) {
    return next(error)
  }
}

async function handlePaymentWebhook(req, res, next) {
  try {
    const result = await processPaymentWebhook({
      rawBody: req.body,
      headers: req.headers,
    })

    return res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error) {
    return next(error)
  }
}

async function handleRefundPayment(req, res, next) {
  try {
    const { id } = parseSchema(refundParamsSchema, req.params)
    const { reason } = parseSchema(refundBodySchema, req.body || {})

    const result = await refundPaymentById({
      paymentId: id,
      userId: req.user.id,
      reason: reason || null,
    })

    return res.json({
      success: true,
      data: result,
      message: result.refunded ? 'Refund completed' : 'Refund initiated',
    })
  } catch (error) {
    return next(error)
  }
}

export {
  handleCreatePayment,
  handleConfirmPayment,
  handlePaymentWebhook,
  handleRefundPayment,
}
