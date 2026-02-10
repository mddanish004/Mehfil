import { and, asc, desc, eq, gt, or } from 'drizzle-orm'
import { db } from '../config/db.js'
import {
  emailVerifications,
  eventHosts,
  events,
  registrationQuestions,
  registrations,
  users,
} from '../models/schema.js'
import {
  generateOTP,
  sendRegistrationConfirmationEmail,
  sendRegistrationVerificationOTP,
} from './email.service.js'
import {
  createTicketData,
  ensureRegistrationQrCode,
  isTicketEligible,
} from './ticket.service.js'
import { refundRegistrationPaymentByRegistrationId } from './payment.service.js'

const ACTIVE_REGISTRATION_STATUSES = ['pending', 'approved', 'registered']

function assertDb() {
  if (!db) {
    const err = new Error('Database is not configured')
    err.statusCode = 500
    throw err
  }
}

function normalizeEmail(email) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    const err = new Error('Valid email is required')
    err.statusCode = 400
    throw err
  }
  return normalized
}

function normalizeRequiredName(name) {
  const normalized = typeof name === 'string' ? name.trim() : ''
  if (!normalized || normalized.length < 2 || normalized.length > 255) {
    const err = new Error('Name must be between 2 and 255 characters')
    err.statusCode = 400
    throw err
  }
  return normalized
}

function normalizeOptionalString(value, maxLength) {
  if (value === undefined || value === null) {
    return null
  }

  const normalized = String(value).trim()
  if (!normalized) {
    return null
  }

  if (normalized.length > maxLength) {
    const err = new Error(`Value must be at most ${maxLength} characters`)
    err.statusCode = 400
    throw err
  }

  return normalized
}

function normalizeSocialProfileLink(value) {
  const normalized = normalizeOptionalString(value, 500)
  if (!normalized) {
    return null
  }

  try {
    const url = new URL(normalized)
    return url.toString()
  } catch {
    const err = new Error('Social profile must be a valid URL')
    err.statusCode = 400
    throw err
  }
}

function normalizeQuestionOptions(options) {
  if (!Array.isArray(options)) {
    return []
  }

  return options
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function assertEventAcceptingRegistration(event) {
  if (!event) {
    const err = new Error('Event not found')
    err.statusCode = 404
    throw err
  }

  if (event.status !== 'published') {
    const err = new Error('Registration is not open for this event')
    err.statusCode = 400
    throw err
  }

  if (new Date(event.endDatetime).getTime() < Date.now()) {
    const err = new Error('This event has already ended')
    err.statusCode = 400
    throw err
  }
}

function validateRegistrationResponses(questions, responses) {
  if (!questions.length) {
    return []
  }

  const payload = responses && typeof responses === 'object' ? responses : {}
  const sanitized = []

  for (const question of questions) {
    const options = normalizeQuestionOptions(question.options)
    const rawValue = payload[question.id]

    if (question.questionType === 'text') {
      const answer = typeof rawValue === 'string' ? rawValue.trim() : ''
      if (question.isRequired && !answer) {
        const err = new Error(`Response required for: ${question.questionText}`)
        err.statusCode = 400
        throw err
      }

      if (answer) {
        sanitized.push({
          questionId: question.id,
          questionText: question.questionText,
          questionType: question.questionType,
          answer,
        })
      }
      continue
    }

    if (question.questionType === 'multiple_choice') {
      const answer = typeof rawValue === 'string' ? rawValue.trim() : ''
      if (question.isRequired && !answer) {
        const err = new Error(`Response required for: ${question.questionText}`)
        err.statusCode = 400
        throw err
      }

      if (answer) {
        if (!options.includes(answer)) {
          const err = new Error(`Invalid answer for: ${question.questionText}`)
          err.statusCode = 400
          throw err
        }

        sanitized.push({
          questionId: question.id,
          questionText: question.questionText,
          questionType: question.questionType,
          answer,
        })
      }
      continue
    }

    if (question.questionType === 'checkbox') {
      const answers = Array.isArray(rawValue)
        ? rawValue.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
        : []

      if (question.isRequired && !answers.length) {
        const err = new Error(`Response required for: ${question.questionText}`)
        err.statusCode = 400
        throw err
      }

      if (answers.length) {
        const uniqueAnswers = [...new Set(answers)]
        const invalid = uniqueAnswers.find((answer) => !options.includes(answer))
        if (invalid) {
          const err = new Error(`Invalid answer for: ${question.questionText}`)
          err.statusCode = 400
          throw err
        }

        sanitized.push({
          questionId: question.id,
          questionText: question.questionText,
          questionType: question.questionType,
          answer: uniqueAnswers,
        })
      }
    }
  }

  return sanitized
}

function serializeRegistration(registration, event) {
  return {
    id: registration.id,
    eventId: registration.eventId,
    shortId: event.shortId,
    eventName: event.name,
    eventStartDatetime: event.startDatetime,
    eventEndDatetime: event.endDatetime,
    timezone: event.timezone,
    name: registration.name,
    email: registration.email,
    phone: registration.phone,
    socialProfileLink: registration.socialProfileLink,
    status: registration.status,
    paymentStatus: registration.paymentStatus,
    paymentId: registration.paymentId,
    emailVerified: Boolean(registration.emailVerified),
    emailVerifiedAt: registration.emailVerifiedAt,
    registrationResponses: registration.registrationResponses || [],
    createdAt: registration.createdAt,
    updatedAt: registration.updatedAt,
  }
}

async function getEventByShortId(shortId) {
  const [event] = await db.select().from(events).where(eq(events.shortId, shortId)).limit(1)
  return event || null
}

async function getQuestionsByEvent(eventId) {
  return db
    .select()
    .from(registrationQuestions)
    .where(eq(registrationQuestions.eventId, eventId))
    .orderBy(asc(registrationQuestions.orderIndex), asc(registrationQuestions.createdAt))
}

async function ensureCapacityForEvent(event, existingRegistrationId = null) {
  if (event.capacityType !== 'limited' || !event.capacityLimit) {
    return
  }

  const rows = await db
    .select({
      id: registrations.id,
      status: registrations.status,
    })
    .from(registrations)
    .where(
      and(
        eq(registrations.eventId, event.id),
        or(
          eq(registrations.status, ACTIVE_REGISTRATION_STATUSES[0]),
          eq(registrations.status, ACTIVE_REGISTRATION_STATUSES[1]),
          eq(registrations.status, ACTIVE_REGISTRATION_STATUSES[2])
        )
      )
    )

  const activeCount = rows.filter((item) => item.id !== existingRegistrationId).length
  if (activeCount >= Number(event.capacityLimit)) {
    const err = new Error('Event is sold out')
    err.statusCode = 400
    throw err
  }
}

async function createRegistrationOtp({ email, eventId, eventName, registrationId }) {
  const recent = await db
    .select({ id: emailVerifications.id })
    .from(emailVerifications)
    .where(
      and(
        eq(emailVerifications.email, email),
        eq(emailVerifications.purpose, 'event_registration'),
        eq(emailVerifications.eventId, eventId),
        gt(emailVerifications.createdAt, new Date(Date.now() - 10 * 60 * 1000))
      )
    )

  if (recent.length >= 3) {
    const err = new Error('Too many OTP requests. Please wait before trying again.')
    err.statusCode = 429
    throw err
  }

  const otp = generateOTP()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await db.insert(emailVerifications).values({
    email,
    purpose: 'event_registration',
    eventId,
    registrationId,
    otp,
    expiresAt,
  })

  await sendRegistrationVerificationOTP({
    email,
    otp,
    eventName,
  })
}

async function sendRegistrationStatusEmail({ registration, event }) {
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

async function registerForEvent({ shortId, payload, viewerUser = null }) {
  assertDb()

  const event = await getEventByShortId(shortId)
  assertEventAcceptingRegistration(event)

  const email = normalizeEmail(payload.email)
  const name = normalizeRequiredName(payload.name)
  const phone = normalizeOptionalString(payload.phone, 50)
  const socialProfileLink = normalizeSocialProfileLink(payload.socialProfileLink)
  const userId =
    viewerUser?.id && viewerUser?.email?.toLowerCase() === email
      ? viewerUser.id
      : null

  const [existingRegistration, questions] = await Promise.all([
    db
      .select()
      .from(registrations)
      .where(and(eq(registrations.eventId, event.id), eq(registrations.email, email)))
      .limit(1)
      .then((rows) => rows[0] || null),
    getQuestionsByEvent(event.id),
  ])

  if (
    existingRegistration &&
    existingRegistration.emailVerified &&
    ACTIVE_REGISTRATION_STATUSES.includes(existingRegistration.status)
  ) {
    const qrCode = await ensureRegistrationQrCode(existingRegistration)
    const registrationWithQr = {
      ...existingRegistration,
      qrCode,
    }

    return {
      registration: serializeRegistration(registrationWithQr, event),
      verificationRequired: false,
      alreadyRegistered: true,
    }
  }

  await ensureCapacityForEvent(event, existingRegistration?.id || null)

  const registrationResponses = validateRegistrationResponses(
    questions,
    payload.registrationResponses
  )

  const now = new Date()
  let registration

  if (existingRegistration) {
    const [updated] = await db
      .update(registrations)
      .set({
        name,
        email,
        phone,
        socialProfileLink,
        userId,
        registrationResponses,
        status: 'pending',
        paymentStatus: event.isPaid ? 'pending' : 'not_required',
        paymentId: null,
        emailVerified: false,
        emailVerifiedAt: null,
        updatedAt: now,
      })
      .where(eq(registrations.id, existingRegistration.id))
      .returning()

    registration = updated
  } else {
    const [created] = await db
      .insert(registrations)
      .values({
        eventId: event.id,
        userId,
        name,
        email,
        phone,
        socialProfileLink,
        registrationResponses,
        status: 'pending',
        paymentStatus: event.isPaid ? 'pending' : 'not_required',
        paymentId: null,
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    registration = created
  }

  const qrCode = await ensureRegistrationQrCode(registration)
  registration = {
    ...registration,
    qrCode,
  }

  await createRegistrationOtp({
    email,
    eventId: event.id,
    eventName: event.name,
    registrationId: registration.id,
  })

  return {
    registration: serializeRegistration(registration, event),
    verificationRequired: true,
    alreadyRegistered: false,
  }
}

async function resendRegistrationOtp({ shortId, email }) {
  assertDb()

  const normalizedEmail = normalizeEmail(email)
  const event = await getEventByShortId(shortId)

  if (!event) {
    const err = new Error('Event not found')
    err.statusCode = 404
    throw err
  }

  const [registration] = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.eventId, event.id), eq(registrations.email, normalizedEmail)))
    .limit(1)

  if (!registration) {
    const err = new Error('Registration not found')
    err.statusCode = 404
    throw err
  }

  if (registration.emailVerified && registration.status === 'registered') {
    const err = new Error('This registration is already verified')
    err.statusCode = 400
    throw err
  }

  await createRegistrationOtp({
    email: normalizedEmail,
    eventId: event.id,
    eventName: event.name,
    registrationId: registration.id,
  })

  return { message: 'OTP sent successfully' }
}

async function verifyRegistrationEmailOtp({ shortId, email, otp }) {
  assertDb()

  const normalizedEmail = normalizeEmail(email)
  const normalizedOtp = typeof otp === 'string' ? otp.trim() : ''
  if (!normalizedOtp) {
    const err = new Error('OTP is required')
    err.statusCode = 400
    throw err
  }

  const event = await getEventByShortId(shortId)
  if (!event) {
    const err = new Error('Event not found')
    err.statusCode = 404
    throw err
  }

  const [verification] = await db
    .select()
    .from(emailVerifications)
    .where(
      and(
        eq(emailVerifications.email, normalizedEmail),
        eq(emailVerifications.purpose, 'event_registration'),
        eq(emailVerifications.eventId, event.id),
        eq(emailVerifications.verified, false),
        gt(emailVerifications.expiresAt, new Date())
      )
    )
    .orderBy(desc(emailVerifications.createdAt))
    .limit(1)

  if (!verification) {
    const err = new Error('No pending verification found or OTP expired')
    err.statusCode = 400
    throw err
  }

  if (verification.attempts >= 5) {
    const err = new Error('Too many failed attempts. Request a new OTP.')
    err.statusCode = 429
    throw err
  }

  if (verification.otp !== normalizedOtp) {
    await db
      .update(emailVerifications)
      .set({ attempts: verification.attempts + 1 })
      .where(eq(emailVerifications.id, verification.id))

    const err = new Error('Invalid OTP')
    err.statusCode = 400
    throw err
  }

  await db
    .update(emailVerifications)
    .set({ verified: true })
    .where(eq(emailVerifications.id, verification.id))

  let registration

  if (verification.registrationId) {
    const [byId] = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, verification.registrationId))
      .limit(1)
    registration = byId
  }

  if (!registration) {
    const [byEmail] = await db
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.eventId, event.id),
          eq(registrations.email, normalizedEmail)
        )
      )
      .limit(1)
    registration = byEmail
  }

  if (!registration) {
    const err = new Error('Registration not found')
    err.statusCode = 404
    throw err
  }

  const now = new Date()
  let targetStatus

  if (event.isPaid && registration.paymentStatus !== 'completed') {
    targetStatus = registration.status === 'approved' ? 'approved' : 'pending'
  } else {
    targetStatus =
      registration.status === 'approved'
        ? 'approved'
        : event.requireApproval
        ? 'pending'
        : 'registered'
  }

  const [updatedRegistration] = await db
    .update(registrations)
    .set({
      status: targetStatus,
      emailVerified: true,
      emailVerifiedAt: now,
      updatedAt: now,
    })
    .where(eq(registrations.id, registration.id))
    .returning()

  const qrCode = await ensureRegistrationQrCode(updatedRegistration)
  const registrationWithQr = {
    ...updatedRegistration,
    qrCode,
  }

  if (!event.isPaid || updatedRegistration.paymentStatus === 'completed') {
    await sendRegistrationStatusEmail({
      registration: registrationWithQr,
      event,
    })
  }

  return {
    registration: serializeRegistration(registrationWithQr, event),
    guestEmail: updatedRegistration.email,
  }
}

async function approveRegistrationById({ registrationId, userId }) {
  assertDb()

  const [row] = await db
    .select({
      registration: registrations,
      event: events,
    })
    .from(registrations)
    .innerJoin(events, eq(registrations.eventId, events.id))
    .where(eq(registrations.id, registrationId))
    .limit(1)

  if (!row) {
    const err = new Error('Registration not found')
    err.statusCode = 404
    throw err
  }

  const [access] = await db
    .select({ id: eventHosts.id })
    .from(eventHosts)
    .where(and(eq(eventHosts.eventId, row.event.id), eq(eventHosts.userId, userId)))
    .limit(1)

  if (!access) {
    const err = new Error('You do not have permission to manage this registration')
    err.statusCode = 403
    throw err
  }

  if (!row.registration.emailVerified) {
    const err = new Error('Email verification is required before approval')
    err.statusCode = 400
    throw err
  }

  if (row.event.isPaid && row.registration.paymentStatus !== 'completed') {
    const err = new Error('Payment must be completed before approval')
    err.statusCode = 400
    throw err
  }

  if (row.registration.status === 'approved') {
    return serializeRegistration(row.registration, row.event)
  }

  if (row.registration.status !== 'pending') {
    const err = new Error('Only pending registrations can be approved')
    err.statusCode = 400
    throw err
  }

  const [updatedRegistration] = await db
    .update(registrations)
    .set({
      status: 'approved',
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, row.registration.id))
    .returning()

  const qrCode = await ensureRegistrationQrCode(updatedRegistration)
  const registrationWithQr = {
    ...updatedRegistration,
    qrCode,
  }

  await sendRegistrationStatusEmail({
    registration: registrationWithQr,
    event: row.event,
  })

  return serializeRegistration(registrationWithQr, row.event)
}

async function rejectRegistrationById({ registrationId, userId }) {
  assertDb()

  const [row] = await db
    .select({
      registration: registrations,
      event: events,
    })
    .from(registrations)
    .innerJoin(events, eq(registrations.eventId, events.id))
    .where(eq(registrations.id, registrationId))
    .limit(1)

  if (!row) {
    const err = new Error('Registration not found')
    err.statusCode = 404
    throw err
  }

  const [access] = await db
    .select({ id: eventHosts.id })
    .from(eventHosts)
    .where(and(eq(eventHosts.eventId, row.event.id), eq(eventHosts.userId, userId)))
    .limit(1)

  if (!access) {
    const err = new Error('You do not have permission to manage this registration')
    err.statusCode = 403
    throw err
  }

  if (row.registration.status === 'rejected') {
    return serializeRegistration(row.registration, row.event)
  }

  if (row.registration.status === 'cancelled') {
    const err = new Error('Cancelled registrations cannot be rejected')
    err.statusCode = 400
    throw err
  }

  let nextPaymentStatus = row.registration.paymentStatus

  if (row.registration.paymentStatus === 'completed') {
    const refundResult = await refundRegistrationPaymentByRegistrationId({
      registrationId: row.registration.id,
      reason: 'Registration rejected by host',
      metadata: {
        source: 'registration_rejection',
        event_id: row.event.id,
        registration_id: row.registration.id,
      },
    })

    if (refundResult.refunded) {
      nextPaymentStatus = 'refunded'
    }
  }

  const [updatedRegistration] = await db
    .update(registrations)
    .set({
      status: 'rejected',
      paymentStatus: nextPaymentStatus,
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, row.registration.id))
    .returning()

  if (updatedRegistration.emailVerified) {
    await sendRegistrationStatusEmail({
      registration: updatedRegistration,
      event: row.event,
    })
  }

  return serializeRegistration(updatedRegistration, row.event)
}

async function getGuestProfile({ userId = null, email = null }) {
  assertDb()

  const normalizedEmail = email ? normalizeEmail(email) : null
  if (!userId && !normalizedEmail) {
    const err = new Error('Authentication required')
    err.statusCode = 401
    throw err
  }

  let whereClause
  if (userId && normalizedEmail) {
    whereClause = or(eq(registrations.userId, userId), eq(registrations.email, normalizedEmail))
  } else if (userId) {
    whereClause = eq(registrations.userId, userId)
  } else {
    whereClause = eq(registrations.email, normalizedEmail)
  }

  const rows = await db
    .select({
      registrationId: registrations.id,
      registrationStatus: registrations.status,
      registrationEmailVerified: registrations.emailVerified,
      registeredAt: registrations.createdAt,
      registrationUpdatedAt: registrations.updatedAt,
      registrationName: registrations.name,
      registrationEmail: registrations.email,
      registrationPhone: registrations.phone,
      registrationSocialProfileLink: registrations.socialProfileLink,
      eventId: events.id,
      eventShortId: events.shortId,
      eventName: events.name,
      eventPhotoUrl: events.photoUrl,
      eventStartDatetime: events.startDatetime,
      eventEndDatetime: events.endDatetime,
      eventTimezone: events.timezone,
      eventLocationType: events.locationType,
      eventLocationAddress: events.locationAddress,
      eventStatus: events.status,
    })
    .from(registrations)
    .innerJoin(events, eq(registrations.eventId, events.id))
    .where(whereClause)
    .orderBy(desc(events.startDatetime), desc(registrations.createdAt))

  let profile = {
    name: null,
    email: normalizedEmail,
    phone: null,
    socialProfileLink: null,
  }

  if (userId) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (user) {
      profile = {
        name: user.name,
        email: user.email,
        phone: user.phone,
        socialProfileLink: user.socialProfileLink,
      }
    }
  } else if (rows.length) {
    const latest = rows[0]
    profile = {
      name: latest.registrationName,
      email: latest.registrationEmail,
      phone: latest.registrationPhone,
      socialProfileLink: latest.registrationSocialProfileLink,
    }
  }

  const now = Date.now()
  const eventsList = rows.map((row) => ({
    registrationId: row.registrationId,
    status: row.registrationStatus,
    emailVerified: Boolean(row.registrationEmailVerified),
    registeredAt: row.registeredAt,
    updatedAt: row.registrationUpdatedAt,
    event: {
      id: row.eventId,
      shortId: row.eventShortId,
      name: row.eventName,
      photoUrl: row.eventPhotoUrl,
      startDatetime: row.eventStartDatetime,
      endDatetime: row.eventEndDatetime,
      timezone: row.eventTimezone,
      locationType: row.eventLocationType,
      locationAddress: row.eventLocationAddress,
      status: row.eventStatus,
    },
  }))

  const upcoming = eventsList.filter(
    (item) => new Date(item.event.endDatetime || item.event.startDatetime).getTime() >= now
  )
  const past = eventsList.filter(
    (item) => new Date(item.event.endDatetime || item.event.startDatetime).getTime() < now
  )

  return {
    profile,
    events: {
      upcoming,
      past,
    },
  }
}

export {
  registerForEvent,
  resendRegistrationOtp,
  verifyRegistrationEmailOtp,
  approveRegistrationById,
  rejectRegistrationById,
  getGuestProfile,
}
