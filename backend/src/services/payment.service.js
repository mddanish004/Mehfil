import DodoPayments from 'dodopayments'
import { and, desc, eq, or } from 'drizzle-orm'
import { db } from '../config/db.js'
import env from '../config/env.js'
import { eventHosts, events, payments, registrations } from '../models/schema.js'
import {
  calculatePaymentBreakdown,
  roundCurrency,
  serializePaymentBreakdown,
} from './payment-pricing.service.js'
import {
  sendPaymentReceiptEmail,
  sendRegistrationConfirmationEmail,
} from './email.service.js'
import { createTicketData, isTicketEligible } from './ticket.service.js'

const dodoClient = env.DODO_PAYMENTS_API_KEY
  ? new DodoPayments({
      bearerToken: env.DODO_PAYMENTS_API_KEY,
      environment: env.DODO_PAYMENTS_ENVIRONMENT,
      webhookKey: env.DODO_PAYMENTS_WEBHOOK_SECRET || null,
    })
  : null

const productCache = new Map()

function assertDb() {
  if (!db) {
    const err = new Error('Database is not configured')
    err.statusCode = 500
    throw err
  }
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function assertDodoClient() {
  if (!dodoClient) {
    const err = new Error('Payment gateway is not configured')
    err.statusCode = 503
    throw err
  }

  return dodoClient
}

function ensurePaymentAmount(value) {
  return roundCurrency(Math.max(0, Number(value || 0)))
}

function toDbDecimal(value) {
  return ensurePaymentAmount(value).toFixed(2)
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapIntentStatus(status) {
  if (!status) {
    return 'pending'
  }

  if (status === 'succeeded') {
    return 'completed'
  }

  if (status === 'failed' || status === 'cancelled') {
    return 'failed'
  }

  return 'pending'
}

function sanitizeMetadata(payload) {
  const result = {}

  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) {
      continue
    }

    result[key] = String(value)
  }

  return result
}

function getViewerIdentity(viewer = {}) {
  return {
    userId: viewer?.userId || viewer?.id || null,
    email: normalizeEmail(viewer?.email || null),
  }
}

async function getRegistrationPaymentContext(registrationId) {
  const [row] = await db
    .select({
      registration: registrations,
      event: events,
    })
    .from(registrations)
    .innerJoin(events, eq(registrations.eventId, events.id))
    .where(eq(registrations.id, registrationId))
    .limit(1)

  return row || null
}

function assertRegistrationPaymentAccess(row, viewer = {}) {
  const identity = getViewerIdentity(viewer)

  if (identity.userId && row.registration.userId === identity.userId) {
    return
  }

  if (identity.email && normalizeEmail(row.registration.email) === identity.email) {
    return
  }

  const err = new Error('You do not have permission to access this payment')
  err.statusCode = 403
  throw err
}

async function assertHostAccess(eventId, userId) {
  const [host] = await db
    .select({ id: eventHosts.id })
    .from(eventHosts)
    .where(and(eq(eventHosts.eventId, eventId), eq(eventHosts.userId, userId)))
    .limit(1)

  if (!host) {
    const err = new Error('You do not have permission to process refunds for this event')
    err.statusCode = 403
    throw err
  }
}

async function getLatestPaymentForRegistration(registrationId) {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.registrationId, registrationId))
    .orderBy(desc(payments.createdAt))
    .limit(1)

  return payment || null
}

async function getPaymentById(paymentId) {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1)
  return payment || null
}

function getTaxCategory() {
  const allowed = new Set(['digital_products', 'saas', 'e_book', 'edtech'])
  const configured = String(env.DODO_PAYMENTS_TAX_CATEGORY || 'digital_products')
  if (allowed.has(configured)) {
    return configured
  }
  return 'digital_products'
}

async function ensureProductId({ event, breakdown }) {
  const client = assertDodoClient()

  if (env.DODO_PAYMENTS_DEFAULT_PRODUCT_ID) {
    return env.DODO_PAYMENTS_DEFAULT_PRODUCT_ID
  }

  const key = `${breakdown.currency}:${breakdown.totalMinor}`
  if (productCache.has(key)) {
    return productCache.get(key)
  }

  const created = await client.products.create({
    name: `${event.name} Ticket`,
    description: `Mehfil event ${event.shortId}`,
    tax_category: getTaxCategory(),
    price: {
      type: 'one_time_price',
      currency: breakdown.currency,
      discount: 0,
      price: breakdown.totalMinor,
      purchasing_power_parity: false,
    },
    metadata: sanitizeMetadata({
      source: 'mehfil_event_payment',
      event_id: event.id,
      event_short_id: event.shortId,
      total_minor: breakdown.totalMinor,
    }),
  })

  productCache.set(key, created.product_id)
  return created.product_id
}

function serializePayment(payment, registration = null, event = null) {
  if (!payment) {
    return null
  }

  const breakdown = serializePaymentBreakdown({
    currency: payment.currency,
    ticketAmount: payment.ticketAmount,
    platformFee: payment.platformFee,
    processingFee: payment.processingFee,
    totalAmount: payment.amount,
  })

  return {
    id: payment.id,
    registrationId: payment.registrationId,
    checkoutSessionId: payment.checkoutSessionId,
    paymentGatewayId: payment.paymentGatewayId,
    status: payment.status,
    paymentMethod: payment.paymentMethod || null,
    amount: toNumber(payment.amount),
    currency: payment.currency,
    breakdown,
    receiptSentAt: payment.receiptSentAt || null,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    registration,
    event,
  }
}

function getReturnUrl({ eventShortId, registrationId }) {
  const base = String(env.CLIENT_URL || '').replace(/\/$/, '')
  return `${base}/events/${eventShortId}/register?registrationId=${registrationId}`
}

async function markReceiptSent(paymentId) {
  await db
    .update(payments)
    .set({
      receiptSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(payments.id, paymentId))
}

async function maybeSendPaymentReceipt({ payment, registration, event }) {
  if (!payment || payment.receiptSentAt) {
    return
  }

  const breakdown = serializePaymentBreakdown({
    currency: payment.currency,
    ticketAmount: payment.ticketAmount,
    platformFee: payment.platformFee,
    processingFee: payment.processingFee,
    totalAmount: payment.amount,
  })

  await sendPaymentReceiptEmail({
    email: registration.email,
    name: registration.name,
    event,
    payment: {
      id: payment.id,
      paymentGatewayId: payment.paymentGatewayId,
      amount: toNumber(payment.amount),
      currency: payment.currency,
      paymentMethod: payment.paymentMethod,
      paidAt: payment.updatedAt || payment.createdAt,
      breakdown,
    },
  })

  await markReceiptSent(payment.id)
}

async function maybeSendRegistrationCompletionEmail({ registration, event }) {
  if (!registration.emailVerified) {
    return
  }

  if (!['approved', 'registered'].includes(registration.status)) {
    return
  }

  let ticket = null

  if (event.locationType === 'physical' && isTicketEligible(registration, event)) {
    ticket = await createTicketData({
      registration,
      event,
      includePdf: true,
    })
  }

  await sendRegistrationConfirmationEmail({
    email: registration.email,
    name: registration.name,
    status: registration.status,
    event,
    ticket,
  })
}

async function applyCompletedPayment({
  payment,
  registration,
  event,
  gatewayPaymentId,
  checkoutSessionId,
  paymentMethod,
}) {
  const now = new Date()

  const [updatedPayment] = await db
    .update(payments)
    .set({
      status: 'completed',
      paymentGatewayId: gatewayPaymentId || payment.paymentGatewayId,
      checkoutSessionId: checkoutSessionId || payment.checkoutSessionId,
      paymentMethod: paymentMethod || payment.paymentMethod,
      updatedAt: now,
    })
    .where(eq(payments.id, payment.id))
    .returning()

  let nextStatus = registration.status

  if (!['cancelled', 'rejected'].includes(registration.status)) {
    if (event.requireApproval) {
      nextStatus = registration.status === 'approved' ? 'approved' : 'pending'
    } else {
      nextStatus = 'registered'
    }
  }

  const [updatedRegistration] = await db
    .update(registrations)
    .set({
      paymentStatus: 'completed',
      paymentId: gatewayPaymentId || registration.paymentId || payment.paymentGatewayId,
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(registrations.id, registration.id))
    .returning()

  try {
    await maybeSendPaymentReceipt({
      payment: updatedPayment,
      registration: updatedRegistration,
      event,
    })
  } catch (error) {
    console.error('Failed to send payment receipt email', error)
  }

  try {
    await maybeSendRegistrationCompletionEmail({
      registration: updatedRegistration,
      event,
    })
  } catch (error) {
    console.error('Failed to send registration confirmation after payment', error)
  }

  return {
    payment: updatedPayment,
    registration: updatedRegistration,
    event,
  }
}

async function applyFailedPayment({
  payment,
  gatewayPaymentId,
  checkoutSessionId,
  paymentMethod,
}) {
  const [updatedPayment] = await db
    .update(payments)
    .set({
      status: 'failed',
      paymentGatewayId: gatewayPaymentId || payment.paymentGatewayId,
      checkoutSessionId: checkoutSessionId || payment.checkoutSessionId,
      paymentMethod: paymentMethod || payment.paymentMethod,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id))
    .returning()

  return updatedPayment
}

async function applyPendingPayment({
  payment,
  gatewayPaymentId,
  checkoutSessionId,
  paymentMethod,
}) {
  const [updatedPayment] = await db
    .update(payments)
    .set({
      status: 'pending',
      paymentGatewayId: gatewayPaymentId || payment.paymentGatewayId,
      checkoutSessionId: checkoutSessionId || payment.checkoutSessionId,
      paymentMethod: paymentMethod || payment.paymentMethod,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id))
    .returning()

  return updatedPayment
}

async function applyGatewayPaymentState({
  payment,
  registration,
  event,
  intentStatus,
  gatewayPaymentId,
  checkoutSessionId,
  paymentMethod,
}) {
  const nextStatus = mapIntentStatus(intentStatus)

  if (nextStatus === 'completed') {
    return applyCompletedPayment({
      payment,
      registration,
      event,
      gatewayPaymentId,
      checkoutSessionId,
      paymentMethod,
    })
  }

  if (nextStatus === 'failed') {
    const updatedPayment = await applyFailedPayment({
      payment,
      gatewayPaymentId,
      checkoutSessionId,
      paymentMethod,
    })

    return {
      payment: updatedPayment,
      registration,
      event,
    }
  }

  const updatedPayment = await applyPendingPayment({
    payment,
    gatewayPaymentId,
    checkoutSessionId,
    paymentMethod,
  })

  return {
    payment: updatedPayment,
    registration,
    event,
  }
}

async function findPaymentByGatewayIds({ paymentId = null, checkoutSessionId = null }) {
  const conditions = []

  if (paymentId) {
    conditions.push(eq(payments.paymentGatewayId, paymentId))
  }

  if (checkoutSessionId) {
    conditions.push(eq(payments.checkoutSessionId, checkoutSessionId))
    conditions.push(eq(payments.paymentGatewayId, checkoutSessionId))
  }

  if (!conditions.length) {
    return null
  }

  const [payment] = await db
    .select()
    .from(payments)
    .where(or(...conditions))
    .orderBy(desc(payments.createdAt))
    .limit(1)

  return payment || null
}

async function createPaymentForRegistration({ registrationId, viewer }) {
  assertDb()

  const row = await getRegistrationPaymentContext(registrationId)

  if (!row) {
    const err = new Error('Registration not found')
    err.statusCode = 404
    throw err
  }

  assertRegistrationPaymentAccess(row, viewer)

  if (!row.event.isPaid) {
    const err = new Error('This event does not require payment')
    err.statusCode = 400
    throw err
  }

  if (!row.registration.emailVerified) {
    const err = new Error('Verify your email before proceeding with payment')
    err.statusCode = 400
    throw err
  }

  if (['cancelled', 'rejected'].includes(row.registration.status)) {
    const err = new Error('Payment is not available for this registration')
    err.statusCode = 400
    throw err
  }

  if (row.registration.paymentStatus === 'completed') {
    const latestPayment = await getLatestPaymentForRegistration(row.registration.id)

    return {
      alreadyPaid: true,
      payment: serializePayment(latestPayment, row.registration, row.event),
      registration: row.registration,
      event: row.event,
      paymentBreakdown: serializePaymentBreakdown(
        calculatePaymentBreakdown(row.event.ticketPrice)
      ),
    }
  }

  const breakdown = calculatePaymentBreakdown(row.event.ticketPrice)
  const productId = await ensureProductId({
    event: row.event,
    breakdown,
  })

  const client = assertDodoClient()

  const session = await client.checkoutSessions.create({
    product_cart: [
      {
        product_id: productId,
        quantity: 1,
        amount: breakdown.totalMinor,
      },
    ],
    customer: {
      email: row.registration.email,
      name: row.registration.name,
    },
    metadata: sanitizeMetadata({
      source: 'mehfil_event_registration',
      event_id: row.event.id,
      event_short_id: row.event.shortId,
      registration_id: row.registration.id,
    }),
    return_url: getReturnUrl({
      eventShortId: row.event.shortId,
      registrationId: row.registration.id,
    }),
  })

  const now = new Date()

  const [createdPayment] = await db
    .insert(payments)
    .values({
      registrationId: row.registration.id,
      amount: toDbDecimal(breakdown.totalAmount),
      ticketAmount: toDbDecimal(breakdown.ticketAmount),
      platformFee: toDbDecimal(breakdown.platformFee),
      processingFee: toDbDecimal(breakdown.processingFee),
      currency: breakdown.currency,
      paymentGatewayId: session.session_id,
      checkoutSessionId: session.session_id,
      status: 'pending',
      paymentMethod: 'checkout_session',
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  const [updatedRegistration] = await db
    .update(registrations)
    .set({
      paymentStatus: 'pending',
      paymentId: session.session_id,
      updatedAt: now,
    })
    .where(eq(registrations.id, row.registration.id))
    .returning()

  return {
    alreadyPaid: false,
    checkoutUrl: session.checkout_url,
    payment: serializePayment(createdPayment, updatedRegistration, row.event),
    registration: updatedRegistration,
    event: row.event,
    paymentBreakdown: serializePaymentBreakdown(breakdown),
    secureCheckout: true,
  }
}

async function getPaymentRecordsByRegistrationId(registrationId) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.registrationId, registrationId))
    .orderBy(desc(payments.createdAt))
    .limit(20)
}

function resolveTargetPayment(paymentRows, { paymentId = null, checkoutSessionId = null }) {
  if (!paymentRows.length) {
    return null
  }

  if (paymentId) {
    const byPaymentId = paymentRows.find(
      (item) => item.paymentGatewayId === paymentId || item.checkoutSessionId === paymentId
    )
    if (byPaymentId) {
      return byPaymentId
    }
  }

  if (checkoutSessionId) {
    const bySession = paymentRows.find(
      (item) =>
        item.checkoutSessionId === checkoutSessionId || item.paymentGatewayId === checkoutSessionId
    )
    if (bySession) {
      return bySession
    }
  }

  return paymentRows[0]
}

async function resolveGatewayPaymentState({ payment, paymentId = null, checkoutSessionId = null }) {
  const client = assertDodoClient()

  const sessionId = checkoutSessionId || payment.checkoutSessionId || null
  let gatewayPaymentId = paymentId || null
  let intentStatus = null
  let paymentMethod = null

  if (sessionId) {
    const sessionStatus = await client.checkoutSessions.retrieve(sessionId)
    if (sessionStatus.payment_id) {
      gatewayPaymentId = sessionStatus.payment_id
    }

    if (sessionStatus.payment_status) {
      intentStatus = sessionStatus.payment_status
    }
  }

  if (gatewayPaymentId) {
    const gatewayPayment = await client.payments.retrieve(gatewayPaymentId)
    intentStatus = gatewayPayment.status || intentStatus
    paymentMethod = gatewayPayment.payment_method_type || gatewayPayment.payment_method || null

    return {
      paymentId: gatewayPayment.payment_id,
      checkoutSessionId: gatewayPayment.checkout_session_id || sessionId,
      intentStatus,
      paymentMethod,
    }
  }

  return {
    paymentId: payment.paymentGatewayId,
    checkoutSessionId: sessionId,
    intentStatus,
    paymentMethod,
  }
}

async function confirmPaymentForRegistration({ registrationId, paymentId, checkoutSessionId, viewer }) {
  assertDb()

  const row = await getRegistrationPaymentContext(registrationId)

  if (!row) {
    const err = new Error('Registration not found')
    err.statusCode = 404
    throw err
  }

  assertRegistrationPaymentAccess(row, viewer)

  if (!row.event.isPaid) {
    const err = new Error('This event does not require payment')
    err.statusCode = 400
    throw err
  }

  const paymentRows = await getPaymentRecordsByRegistrationId(registrationId)
  const targetPayment = resolveTargetPayment(paymentRows, {
    paymentId,
    checkoutSessionId,
  })

  if (!targetPayment) {
    const err = new Error('No payment record found for this registration')
    err.statusCode = 404
    throw err
  }

  const gatewayState = await resolveGatewayPaymentState({
    payment: targetPayment,
    paymentId,
    checkoutSessionId,
  })

  const result = await applyGatewayPaymentState({
    payment: targetPayment,
    registration: row.registration,
    event: row.event,
    intentStatus: gatewayState.intentStatus,
    gatewayPaymentId: gatewayState.paymentId,
    checkoutSessionId: gatewayState.checkoutSessionId,
    paymentMethod: gatewayState.paymentMethod,
  })

  return {
    payment: serializePayment(result.payment, result.registration, result.event),
    registration: result.registration,
    event: result.event,
    gatewayStatus: gatewayState.intentStatus,
  }
}

function normalizeHeaders(headers) {
  const normalized = {}

  for (const [key, value] of Object.entries(headers || {})) {
    if (typeof value === 'string') {
      normalized[key.toLowerCase()] = value
      continue
    }

    if (Array.isArray(value)) {
      normalized[key.toLowerCase()] = value.join(',')
    }
  }

  return normalized
}

async function handlePaymentWebhookEvent({ type, data }) {
  if (!type || !data || typeof data !== 'object') {
    return { handled: false }
  }

  if (type === 'payment.succeeded' || type === 'payment.failed' || type === 'payment.processing') {
    const paymentData = data

    const matchedPayment = await findPaymentByGatewayIds({
      paymentId: paymentData.payment_id || null,
      checkoutSessionId: paymentData.checkout_session_id || null,
    })

    if (!matchedPayment) {
      return {
        handled: false,
        eventType: type,
      }
    }

    const row = await getRegistrationPaymentContext(matchedPayment.registrationId)
    if (!row) {
      return {
        handled: false,
        eventType: type,
      }
    }

    const result = await applyGatewayPaymentState({
      payment: matchedPayment,
      registration: row.registration,
      event: row.event,
      intentStatus: paymentData.status,
      gatewayPaymentId: paymentData.payment_id || null,
      checkoutSessionId: paymentData.checkout_session_id || matchedPayment.checkoutSessionId,
      paymentMethod: paymentData.payment_method_type || paymentData.payment_method || null,
    })

    return {
      handled: true,
      eventType: type,
      payment: serializePayment(result.payment, result.registration, result.event),
    }
  }

  if (type === 'refund.succeeded' || type === 'refund.failed') {
    const refund = data
    const paymentId = refund.payment_id || null

    if (!paymentId) {
      return {
        handled: false,
        eventType: type,
      }
    }

    const matchedPayment = await findPaymentByGatewayIds({
      paymentId,
    })

    if (!matchedPayment) {
      return {
        handled: false,
        eventType: type,
      }
    }

    const now = new Date()
    const isSucceeded = type === 'refund.succeeded'

    const [updatedPayment] = await db
      .update(payments)
      .set({
        status: isSucceeded ? 'refunded' : matchedPayment.status,
        refundGatewayId: refund.refund_id || matchedPayment.refundGatewayId,
        updatedAt: now,
      })
      .where(eq(payments.id, matchedPayment.id))
      .returning()

    if (isSucceeded) {
      await db
        .update(registrations)
        .set({
          paymentStatus: 'refunded',
          updatedAt: now,
        })
        .where(eq(registrations.id, matchedPayment.registrationId))
    }

    return {
      handled: true,
      eventType: type,
      payment: serializePayment(updatedPayment),
    }
  }

  return {
    handled: false,
    eventType: type,
  }
}

async function processPaymentWebhook({ rawBody, headers }) {
  assertDb()

  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    const err = new Error('Raw request body is required for webhook verification')
    err.statusCode = 400
    throw err
  }

  const client = assertDodoClient()
  const signatureHeaders = normalizeHeaders(headers)

  let event

  try {
    event = client.webhooks.unwrap(rawBody.toString('utf8'), {
      headers: signatureHeaders,
      key: env.DODO_PAYMENTS_WEBHOOK_SECRET || undefined,
    })
  } catch {
    const err = new Error('Invalid webhook signature')
    err.statusCode = 401
    throw err
  }

  return handlePaymentWebhookEvent(event)
}

async function resolveGatewayPaymentId(payment) {
  if (payment?.paymentGatewayId && payment.status !== 'pending') {
    return payment.paymentGatewayId
  }

  if (payment?.checkoutSessionId) {
    const client = assertDodoClient()
    const session = await client.checkoutSessions.retrieve(payment.checkoutSessionId)
    if (session.payment_id) {
      return session.payment_id
    }
  }

  return payment?.paymentGatewayId || null
}

async function createRefund({ payment, reason, metadata = {} }) {
  const client = assertDodoClient()

  const gatewayPaymentId = await resolveGatewayPaymentId(payment)
  if (!gatewayPaymentId) {
    const err = new Error('Payment is not ready for refund')
    err.statusCode = 400
    throw err
  }

  const refund = await client.refunds.create({
    payment_id: gatewayPaymentId,
    reason: reason || 'Refund requested',
    metadata: sanitizeMetadata(metadata),
  })

  const now = new Date()

  if (refund.status === 'succeeded') {
    const [updatedPayment] = await db
      .update(payments)
      .set({
        status: 'refunded',
        paymentGatewayId: gatewayPaymentId,
        refundGatewayId: refund.refund_id || payment.refundGatewayId,
        updatedAt: now,
      })
      .where(eq(payments.id, payment.id))
      .returning()

    await db
      .update(registrations)
      .set({
        paymentStatus: 'refunded',
        updatedAt: now,
      })
      .where(eq(registrations.id, payment.registrationId))

    return {
      refund,
      payment: updatedPayment,
      refunded: true,
      pending: false,
    }
  }

  await db
    .update(payments)
    .set({
      paymentGatewayId: gatewayPaymentId,
      refundGatewayId: refund.refund_id || payment.refundGatewayId,
      updatedAt: now,
    })
    .where(eq(payments.id, payment.id))

  return {
    refund,
    payment,
    refunded: false,
    pending: refund.status === 'pending' || refund.status === 'review',
  }
}

async function refundPaymentById({ paymentId, userId, reason }) {
  assertDb()

  const payment = await getPaymentById(paymentId)
  if (!payment) {
    const err = new Error('Payment not found')
    err.statusCode = 404
    throw err
  }

  const row = await getRegistrationPaymentContext(payment.registrationId)
  if (!row) {
    const err = new Error('Registration not found for this payment')
    err.statusCode = 404
    throw err
  }

  await assertHostAccess(row.event.id, userId)

  if (payment.status === 'refunded') {
    return {
      payment: serializePayment(payment, row.registration, row.event),
      refunded: true,
      pending: false,
    }
  }

  if (payment.status !== 'completed') {
    const err = new Error('Only completed payments can be refunded')
    err.statusCode = 400
    throw err
  }

  const result = await createRefund({
    payment,
    reason,
    metadata: {
      source: 'host_refund',
      event_id: row.event.id,
      registration_id: row.registration.id,
    },
  })

  return {
    payment: serializePayment(result.payment, row.registration, row.event),
    refunded: result.refunded,
    pending: result.pending,
  }
}

async function refundRegistrationPaymentByRegistrationId({ registrationId, reason, metadata = {} }) {
  assertDb()

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.registrationId, registrationId), eq(payments.status, 'completed')))
    .orderBy(desc(payments.createdAt))
    .limit(1)

  if (!payment) {
    return {
      refunded: false,
      pending: false,
      payment: null,
    }
  }

  const result = await createRefund({
    payment,
    reason,
    metadata,
  })

  return {
    refunded: result.refunded,
    pending: result.pending,
    payment: result.payment,
    refund: result.refund,
  }
}

async function getPaymentStatusForRegistration({ registrationId, viewer }) {
  assertDb()

  const row = await getRegistrationPaymentContext(registrationId)
  if (!row) {
    const err = new Error('Registration not found')
    err.statusCode = 404
    throw err
  }

  assertRegistrationPaymentAccess(row, viewer)

  const latestPayment = await getLatestPaymentForRegistration(registrationId)

  return {
    registration: row.registration,
    event: row.event,
    payment: serializePayment(latestPayment, row.registration, row.event),
    paymentBreakdown: row.event.isPaid
      ? serializePaymentBreakdown(calculatePaymentBreakdown(row.event.ticketPrice))
      : null,
  }
}

async function syncPaymentByGateway({ paymentId = null, checkoutSessionId = null }) {
  assertDb()

  const payment = await findPaymentByGatewayIds({
    paymentId,
    checkoutSessionId,
  })

  if (!payment) {
    return null
  }

  const row = await getRegistrationPaymentContext(payment.registrationId)
  if (!row) {
    return null
  }

  const gatewayState = await resolveGatewayPaymentState({
    payment,
    paymentId,
    checkoutSessionId,
  })

  const result = await applyGatewayPaymentState({
    payment,
    registration: row.registration,
    event: row.event,
    intentStatus: gatewayState.intentStatus,
    gatewayPaymentId: gatewayState.paymentId,
    checkoutSessionId: gatewayState.checkoutSessionId,
    paymentMethod: gatewayState.paymentMethod,
  })

  return {
    payment: serializePayment(result.payment, result.registration, result.event),
    registration: result.registration,
    event: result.event,
  }
}

export {
  createPaymentForRegistration,
  confirmPaymentForRegistration,
  processPaymentWebhook,
  refundPaymentById,
  refundRegistrationPaymentByRegistrationId,
  getPaymentStatusForRegistration,
  syncPaymentByGateway,
}
