import { ZodError, z } from 'zod'
import { getRegistrationTicketById } from '../services/ticket.service.js'
import {
  checkInRegistrationById,
  verifyQrAndCheckInByHost,
} from '../services/registration.service.js'

const registrationParamsSchema = z.object({
  registrationId: z.string().uuid(),
})

const checkinParamsSchema = z.object({
  registrationId: z.string().uuid(),
})

const ticketQuerySchema = z.object({
  format: z.enum(['json', 'pdf']).optional(),
})

const verifyQrSchema = z.object({
  eventShortId: z.string().trim().min(1).max(255),
  qrCode: z.string().trim().min(1).max(5000),
  source: z.enum(['scanner', 'manual', 'offline_sync']).optional(),
})

const manualCheckinBodySchema = z.object({
  eventShortId: z.string().trim().min(1).max(255).optional(),
  source: z.enum(['scanner', 'manual', 'offline_sync']).optional(),
})

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

async function handleGetRegistrationTicket(req, res, next) {
  try {
    const { registrationId } = parseSchema(registrationParamsSchema, req.params)
    const { format = 'json' } = parseSchema(ticketQuerySchema, req.query || {})

    const result = await getRegistrationTicketById({
      registrationId,
      viewer: {
        userId: req.user?.id || null,
        email: req.guest?.email || req.user?.email || null,
      },
      includePdf: format === 'pdf',
    })

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="ticket-${result.ticket.registrationId}.pdf"`
      )
      return res.send(result.pdfBuffer)
    }

    return res.json({
      success: true,
      data: {
        ticket: result.ticket,
        qrPayload: result.qrPayload,
        qrDataUrl: result.qrDataUrl,
      },
    })
  } catch (error) {
    return next(error)
  }
}

async function handleVerifyRegistrationQr(req, res, next) {
  try {
    const payload = parseSchema(verifyQrSchema, req.body || {})
    const result = await verifyQrAndCheckInByHost({
      eventShortId: payload.eventShortId,
      qrCode: payload.qrCode,
      userId: req.user.id,
      source: payload.source || 'scanner',
    })

    return res.json({
      success: true,
      data: result,
      message: 'Guest checked in successfully',
    })
  } catch (error) {
    return next(error)
  }
}

async function handleManualCheckIn(req, res, next) {
  try {
    const { registrationId } = parseSchema(checkinParamsSchema, req.params)
    const payload = parseSchema(manualCheckinBodySchema, req.body || {})
    const result = await checkInRegistrationById({
      registrationId,
      userId: req.user.id,
      eventShortId: payload.eventShortId || null,
      source: payload.source || 'manual',
    })

    return res.json({
      success: true,
      data: result,
      message: 'Guest checked in successfully',
    })
  } catch (error) {
    return next(error)
  }
}

export { handleGetRegistrationTicket, handleVerifyRegistrationQr, handleManualCheckIn }
