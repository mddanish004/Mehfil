import { and, asc, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import { db } from '../config/db.js'
import {
  events,
  eventHosts,
  eventUpdates,
  registrationQuestions,
  registrations,
  users,
} from '../models/schema.js'
import { generateShortId } from '../utils/shortId.js'
import { generateZoomMeetingLink } from './zoom.service.js'
import {
  calculatePaymentBreakdown,
  serializePaymentBreakdown,
} from './payment-pricing.service.js'
import { refundRegistrationPaymentByRegistrationId } from './payment.service.js'

function assertDb() {
  if (!db) {
    const err = new Error('Database is not configured')
    err.statusCode = 500
    throw err
  }
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isNaN(numeric) ? fallback : numeric
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    const err = new Error('Invalid date provided')
    err.statusCode = 400
    throw err
  }
  return date
}

function normalizeCoordinate(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const numeric = Number(value)
  if (Number.isNaN(numeric)) {
    const err = new Error('Invalid coordinates provided')
    err.statusCode = 400
    throw err
  }

  return numeric.toFixed(7)
}

function normalizeTicketPrice(value) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const numeric = Number(value)
  if (Number.isNaN(numeric) || numeric < 0) {
    const err = new Error('Invalid ticket price')
    err.statusCode = 400
    throw err
  }

  return numeric.toFixed(2)
}

function normalizeQuestionOptions(options) {
  if (!Array.isArray(options)) {
    return []
  }

  return options
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 20)
}

function normalizeRegistrationQuestions(questions) {
  if (!Array.isArray(questions)) {
    return []
  }

  return questions
    .map((question, index) => {
      if (!question || typeof question !== 'object') {
        return null
      }

      const questionText = typeof question.questionText === 'string' ? question.questionText.trim() : ''
      const questionType = question.questionType
      const options = normalizeQuestionOptions(question.options)
      const isRequired = Boolean(question.isRequired)
      const orderIndex = Number.isInteger(question.orderIndex) ? question.orderIndex : index

      if (!questionText) {
        return null
      }

      if (!['text', 'multiple_choice', 'checkbox'].includes(questionType)) {
        return null
      }

      if (questionType !== 'text' && options.length < 2) {
        const err = new Error('Choice questions must include at least 2 options')
        err.statusCode = 400
        throw err
      }

      return {
        questionText,
        questionType,
        options: questionType === 'text' ? null : options,
        isRequired,
        orderIndex,
      }
    })
    .filter(Boolean)
}

function serializeEvent(event) {
  const ticketPrice = toNumber(event.ticketPrice, 0)

  return {
    ...event,
    ticketPrice,
    locationLat: event.locationLat === null ? null : Number(event.locationLat),
    locationLng: event.locationLng === null ? null : Number(event.locationLng),
    zoomMeetingLink: event.googleMeetLink || null,
    paymentBreakdown: event.isPaid
      ? serializePaymentBreakdown(calculatePaymentBreakdown(ticketPrice))
      : null,
  }
}

function serializeRegistrationQuestion(question) {
  const options = Array.isArray(question.options)
    ? question.options
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : []

  return {
    id: question.id,
    eventId: question.eventId,
    questionText: question.questionText,
    questionType: question.questionType,
    options,
    isRequired: Boolean(question.isRequired),
    orderIndex: Number(question.orderIndex || 0),
    createdAt: question.createdAt,
  }
}

function serializeEventWithCreator(row, options = {}) {
  if (!row) {
    return null
  }

  const { creatorName, creatorEmail, ...event } = row
  const registrationQuestionsList = options.registrationQuestions || []
  const viewerRegistration = options.viewerRegistration || null

  return {
    ...serializeEvent(event),
    registrationQuestions: registrationQuestionsList,
    viewerRegistration,
    creator: {
      id: event.creatorId,
      name: creatorName || null,
      email: creatorEmail || null,
    },
  }
}

const EVENTS_PER_PAGE = 20
const ACTIVE_ATTENDANCE_STATUSES = ['approved', 'pending', 'registered']
const ACTIVE_REGISTRATION_STATUSES = ['pending', 'approved', 'registered']
const attendeeCountExpr = sql`(
  select count(*)::int
  from ${registrations}
  where ${registrations.eventId} = ${events.id}
    and (
      ${registrations.status} = ${ACTIVE_REGISTRATION_STATUSES[0]}
      or ${registrations.status} = ${ACTIVE_REGISTRATION_STATUSES[1]}
      or ${registrations.status} = ${ACTIVE_REGISTRATION_STATUSES[2]}
    )
)`

function serializeEventCardRow(row) {
  if (!row) {
    return null
  }

  const { creatorName, creatorEmail, attendeeCount, ...event } = row

  return {
    ...serializeEvent(event),
    attendeeCount: toNumber(attendeeCount, 0),
    creator: {
      id: event.creatorId,
      name: creatorName || null,
      email: creatorEmail || null,
    },
  }
}

function dedupeEventsById(eventList) {
  const seen = new Set()
  return eventList.filter((event) => {
    if (seen.has(event.id)) {
      return false
    }
    seen.add(event.id)
    return true
  })
}

function buildListWhereClause(filters = {}) {
  const conditions = []

  if (filters.search) {
    const query = `%${filters.search}%`
    conditions.push(or(ilike(events.name, query), ilike(events.description, query)))
  }

  if (filters.startDate) {
    conditions.push(gte(events.startDatetime, filters.startDate))
  }

  if (filters.endDate) {
    conditions.push(lte(events.startDatetime, filters.endDate))
  }

  if (filters.location) {
    conditions.push(ilike(events.locationAddress, `%${filters.location}%`))
  }

  if (filters.priceType === 'free') {
    conditions.push(eq(events.isPaid, false))
  }

  if (filters.priceType === 'paid') {
    conditions.push(eq(events.isPaid, true))
  }

  if (filters.minPrice !== undefined) {
    conditions.push(gte(events.ticketPrice, Number(filters.minPrice).toFixed(2)))
  }

  if (filters.maxPrice !== undefined) {
    conditions.push(lte(events.ticketPrice, Number(filters.maxPrice).toFixed(2)))
  }

  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(events.status, filters.status))
  } else if (!filters.status) {
    conditions.push(eq(events.status, 'published'))
  }

  if (!conditions.length) {
    return undefined
  }

  return and(...conditions)
}

function buildSortOrder(sort) {
  if (sort === 'newest') {
    return [desc(events.createdAt), asc(events.startDatetime)]
  }

  if (sort === 'popularity') {
    return [desc(attendeeCountExpr), asc(events.startDatetime)]
  }

  return [asc(events.startDatetime), desc(events.createdAt)]
}

async function getMyEvents(userId) {
  if (!userId) {
    return null
  }

  const [hostedRows, attendedRows] = await Promise.all([
    db
      .select({
        ...events,
        creatorName: users.name,
        creatorEmail: users.email,
        attendeeCount: attendeeCountExpr,
      })
      .from(events)
      .innerJoin(eventHosts, eq(eventHosts.eventId, events.id))
      .leftJoin(users, eq(events.creatorId, users.id))
      .where(eq(eventHosts.userId, userId))
      .orderBy(asc(events.startDatetime), desc(events.createdAt))
      .limit(EVENTS_PER_PAGE),
    db
      .select({
        ...events,
        creatorName: users.name,
        creatorEmail: users.email,
        attendeeCount: attendeeCountExpr,
      })
      .from(events)
      .innerJoin(registrations, eq(registrations.eventId, events.id))
      .leftJoin(users, eq(events.creatorId, users.id))
      .where(
        and(
          eq(registrations.userId, userId),
          or(
            eq(registrations.status, ACTIVE_ATTENDANCE_STATUSES[0]),
            eq(registrations.status, ACTIVE_ATTENDANCE_STATUSES[1]),
            eq(registrations.status, ACTIVE_ATTENDANCE_STATUSES[2])
          )
        )
      )
      .orderBy(asc(events.startDatetime), desc(events.createdAt))
      .limit(EVENTS_PER_PAGE),
  ])

  return {
    hosted: dedupeEventsById(hostedRows.map(serializeEventCardRow)),
    attended: dedupeEventsById(attendedRows.map(serializeEventCardRow)),
  }
}

function detectUpdateType(before, after) {
  const beforeStart = new Date(before.startDatetime).getTime()
  const afterStart = new Date(after.startDatetime).getTime()
  const beforeEnd = new Date(before.endDatetime).getTime()
  const afterEnd = new Date(after.endDatetime).getTime()

  if (before.status !== after.status && after.status === 'cancelled') {
    return 'cancellation'
  }

  if (beforeStart !== afterStart || beforeEnd !== afterEnd || before.timezone !== after.timezone) {
    return 'date_time'
  }

  if (
    before.locationType !== after.locationType ||
    before.locationAddress !== after.locationAddress ||
    before.locationLat !== after.locationLat ||
    before.locationLng !== after.locationLng ||
    before.googleMeetLink !== after.googleMeetLink
  ) {
    return 'location'
  }

  return 'details'
}

function businessRules(eventData) {
  const start = normalizeDate(eventData.startDatetime)
  const end = normalizeDate(eventData.endDatetime)

  if (end <= start) {
    const err = new Error('End date/time must be after start date/time')
    err.statusCode = 400
    throw err
  }

  if (eventData.capacityType === 'limited') {
    if (!eventData.capacityLimit || Number(eventData.capacityLimit) < 1) {
      const err = new Error('Capacity limit is required for limited events')
      err.statusCode = 400
      throw err
    }
  }

  if (eventData.isPaid && toNumber(eventData.ticketPrice, 0) <= 0) {
    const err = new Error('Paid events must have a ticket price greater than 0')
    err.statusCode = 400
    throw err
  }
}

function normalizePayload(payload) {
  const normalized = { ...payload }

  if (normalized.name !== undefined) {
    normalized.name = normalized.name.trim()
  }

  if (normalized.description !== undefined) {
    normalized.description = normalized.description?.trim() || null
  }

  if (normalized.photoUrl !== undefined) {
    normalized.photoUrl = normalized.photoUrl || null
  }

  if (normalized.startDatetime !== undefined) {
    normalized.startDatetime = normalizeDate(normalized.startDatetime)
  }

  if (normalized.endDatetime !== undefined) {
    normalized.endDatetime = normalizeDate(normalized.endDatetime)
  }

  if (normalized.timezone !== undefined) {
    normalized.timezone = normalized.timezone.trim()
  }

  if (normalized.locationAddress !== undefined) {
    normalized.locationAddress = normalized.locationAddress?.trim() || null
  }

  if (normalized.locationLat !== undefined) {
    normalized.locationLat = normalizeCoordinate(normalized.locationLat)
  }

  if (normalized.locationLng !== undefined) {
    normalized.locationLng = normalizeCoordinate(normalized.locationLng)
  }

  if (normalized.zoomMeetingLink !== undefined) {
    normalized.googleMeetLink = normalized.zoomMeetingLink || null
  }

  if (normalized.ticketPrice !== undefined) {
    normalized.ticketPrice = normalizeTicketPrice(normalized.ticketPrice)
  }

  if (normalized.capacityLimit !== undefined) {
    normalized.capacityLimit =
      normalized.capacityLimit === null ? null : Math.trunc(Number(normalized.capacityLimit))
  }

  if (normalized.locationType === 'virtual') {
    normalized.locationAddress = null
    normalized.locationLat = null
    normalized.locationLng = null
  }

  if (normalized.locationType === 'physical') {
    normalized.googleMeetLink = null
  }

  if (normalized.capacityType === 'unlimited') {
    normalized.capacityLimit = null
  }

  if (normalized.isPaid === false) {
    normalized.ticketPrice = '0.00'
  }

  if (normalized.registrationQuestions !== undefined) {
    normalized.registrationQuestions = normalizeRegistrationQuestions(normalized.registrationQuestions)
  }

  delete normalized.zoomMeetingLink

  return normalized
}

async function findEventRecordByShortId(shortId) {
  assertDb()

  const [event] = await db.select().from(events).where(eq(events.shortId, shortId)).limit(1)
  return event || null
}

async function listRegistrationQuestionsForEvent(eventId) {
  const rows = await db
    .select()
    .from(registrationQuestions)
    .where(eq(registrationQuestions.eventId, eventId))
    .orderBy(asc(registrationQuestions.orderIndex), asc(registrationQuestions.createdAt))

  return rows.map(serializeRegistrationQuestion)
}

async function replaceRegistrationQuestionsForEvent(eventId, questions) {
  await db.delete(registrationQuestions).where(eq(registrationQuestions.eventId, eventId))

  if (!questions?.length) {
    return
  }

  await db.insert(registrationQuestions).values(
    questions.map((question, index) => ({
      eventId,
      questionText: question.questionText,
      questionType: question.questionType,
      options: question.questionType === 'text' ? null : question.options,
      isRequired: Boolean(question.isRequired),
      orderIndex: Number.isInteger(question.orderIndex) ? question.orderIndex : index,
    }))
  )
}

async function getViewerRegistrationForEvent(eventId, viewer = {}) {
  const conditions = [eq(registrations.eventId, eventId)]

  if (viewer.userId) {
    conditions.push(eq(registrations.userId, viewer.userId))
  } else if (viewer.email) {
    conditions.push(eq(registrations.email, viewer.email.toLowerCase()))
  } else {
    return null
  }

  const [row] = await db
    .select({
      id: registrations.id,
      email: registrations.email,
      name: registrations.name,
      status: registrations.status,
      paymentStatus: registrations.paymentStatus,
      paymentId: registrations.paymentId,
      emailVerified: registrations.emailVerified,
      emailVerifiedAt: registrations.emailVerifiedAt,
      createdAt: registrations.createdAt,
      updatedAt: registrations.updatedAt,
    })
    .from(registrations)
    .where(and(...conditions))
    .orderBy(desc(registrations.updatedAt))
    .limit(1)

  if (!row) {
    return null
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    paymentStatus: row.paymentStatus,
    paymentId: row.paymentId,
    emailVerified: Boolean(row.emailVerified),
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function getEventByShortId(shortId, viewer = {}) {
  assertDb()

  const [row] = await db
    .select({
      ...events,
      creatorName: users.name,
      creatorEmail: users.email,
    })
    .from(events)
    .leftJoin(users, eq(events.creatorId, users.id))
    .where(eq(events.shortId, shortId))
    .limit(1)

  if (!row) {
    return null
  }

  const [questions, viewerRegistration] = await Promise.all([
    listRegistrationQuestionsForEvent(row.id),
    getViewerRegistrationForEvent(row.id, viewer),
  ])

  return serializeEventWithCreator(row, {
    registrationQuestions: questions,
    viewerRegistration,
  })
}

async function listEvents({ userId, filters = {} }) {
  assertDb()

  const page = Math.max(1, Number(filters.page || 1))
  const offset = (page - 1) * EVENTS_PER_PAGE
  const whereClause = buildListWhereClause(filters)
  const sortOrder = buildSortOrder(filters.sort)

  let countQuery = db
    .select({
      total: sql`count(*)::int`,
    })
    .from(events)

  if (whereClause) {
    countQuery = countQuery.where(whereClause)
  }

  let eventsQuery = db
    .select({
      ...events,
      creatorName: users.name,
      creatorEmail: users.email,
      attendeeCount: attendeeCountExpr,
    })
    .from(events)
    .leftJoin(users, eq(events.creatorId, users.id))

  if (whereClause) {
    eventsQuery = eventsQuery.where(whereClause)
  }

  const [countResult, pagedEvents, myEvents] = await Promise.all([
    countQuery,
    eventsQuery.orderBy(...sortOrder).limit(EVENTS_PER_PAGE).offset(offset),
    getMyEvents(userId),
  ])

  const total = toNumber(countResult?.[0]?.total, 0)
  const totalPages = total > 0 ? Math.ceil(total / EVENTS_PER_PAGE) : 0

  return {
    events: pagedEvents.map(serializeEventCardRow),
    pagination: {
      page,
      limit: EVENTS_PER_PAGE,
      total,
      totalPages,
      hasMore: page * EVENTS_PER_PAGE < total,
    },
    myEvents,
  }
}

async function generateUniqueShortId(name) {
  assertDb()

  for (let attempts = 0; attempts < 10; attempts += 1) {
    const shortId = generateShortId(name)
    const [existing] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.shortId, shortId))
      .limit(1)

    if (!existing) {
      return shortId
    }
  }

  const err = new Error('Failed to generate a unique event URL')
  err.statusCode = 500
  throw err
}

async function ensureHostAccess(eventId, userId) {
  assertDb()

  const [hostAccess] = await db
    .select({ id: eventHosts.id })
    .from(eventHosts)
    .where(and(eq(eventHosts.eventId, eventId), eq(eventHosts.userId, userId)))
    .limit(1)

  if (!hostAccess) {
    const err = new Error('You do not have permission to manage this event')
    err.statusCode = 403
    throw err
  }
}

async function maybeGenerateZoomLink(payload) {
  if (payload.locationType !== 'virtual' || payload.googleMeetLink || !payload.generateZoomLink) {
    return { payload, zoomInfo: null }
  }

  const zoomInfo = await generateZoomMeetingLink({
    topic: payload.name,
    agenda: payload.description || '',
    startDatetime: payload.startDatetime,
    endDatetime: payload.endDatetime,
    timezone: payload.timezone,
  })

  return {
    payload: { ...payload, googleMeetLink: zoomInfo.link },
    zoomInfo,
  }
}

async function createEvent({ userId, payload }) {
  assertDb()

  let normalized = normalizePayload(payload)
  const registrationQuestionsPayload = normalized.registrationQuestions || []
  delete normalized.registrationQuestions

  const { payload: payloadWithZoom, zoomInfo } = await maybeGenerateZoomLink(normalized)
  normalized = { ...payloadWithZoom }

  const shortId = await generateUniqueShortId(normalized.name)
  const now = new Date()

  const eventToInsert = {
    ...normalized,
    shortId,
    creatorId: userId,
    status: normalized.status || 'draft',
    ticketPrice: normalized.ticketPrice || '0.00',
    createdAt: now,
    updatedAt: now,
  }

  delete eventToInsert.generateZoomLink

  businessRules(eventToInsert)

  const [created] = await db.insert(events).values(eventToInsert).returning()

  await db.insert(eventHosts).values({
    eventId: created.id,
    userId,
    role: 'creator',
  })

  await replaceRegistrationQuestionsForEvent(created.id, registrationQuestionsPayload)

  const event = await getEventByShortId(created.shortId)

  return { event, zoomInfo }
}

async function updateEventByShortId({ shortId, userId, payload }) {
  assertDb()

  const current = await findEventRecordByShortId(shortId)
  if (!current) {
    const err = new Error('Event not found')
    err.statusCode = 404
    throw err
  }

  await ensureHostAccess(current.id, userId)

  let normalized = normalizePayload(payload)
  const registrationQuestionsPayload = normalized.registrationQuestions
  delete normalized.registrationQuestions

  const targetLocationType = normalized.locationType || current.locationType
  const requiresZoomGeneration =
    targetLocationType === 'virtual' && !normalized.googleMeetLink && normalized.generateZoomLink

  let zoomInfo = null
  if (requiresZoomGeneration) {
    zoomInfo = await generateZoomMeetingLink({
      topic: normalized.name || current.name,
      agenda: normalized.description ?? current.description ?? '',
      startDatetime: normalized.startDatetime || current.startDatetime,
      endDatetime: normalized.endDatetime || current.endDatetime,
      timezone: normalized.timezone || current.timezone,
    })
    normalized.googleMeetLink = zoomInfo.link
  }

  const merged = {
    ...current,
    ...normalized,
    startDatetime: normalized.startDatetime || current.startDatetime,
    endDatetime: normalized.endDatetime || current.endDatetime,
    ticketPrice: normalized.ticketPrice !== undefined ? normalized.ticketPrice : current.ticketPrice,
  }

  businessRules(merged)

  const updateData = {
    ...normalized,
    updatedAt: new Date(),
  }
  delete updateData.generateZoomLink

  const [updated] = await db.update(events).set(updateData).where(eq(events.id, current.id)).returning()

  const updateType = detectUpdateType(current, updated)

  await db.insert(eventUpdates).values({
    eventId: current.id,
    updatedBy: userId,
    updateType,
    oldValues: current,
    newValues: updated,
  })

  if (registrationQuestionsPayload !== undefined) {
    await replaceRegistrationQuestionsForEvent(current.id, registrationQuestionsPayload)
  }

  const event = await getEventByShortId(shortId)
  return { event, zoomInfo }
}

async function cancelEventByShortId({ shortId, userId, refundMode = 'none' }) {
  assertDb()

  const current = await findEventRecordByShortId(shortId)
  if (!current) {
    const err = new Error('Event not found')
    err.statusCode = 404
    throw err
  }

  await ensureHostAccess(current.id, userId)

  if (current.status === 'cancelled') {
    return {
      event: await getEventByShortId(shortId),
      refundSummary: {
        refundMode,
        refundedPayments: 0,
        cancelledRegistrations: 0,
        alreadyCancelled: true,
      },
    }
  }

  const now = new Date()

  const [updated] = await db
    .update(events)
    .set({
      status: 'cancelled',
      updatedAt: now,
    })
    .where(eq(events.id, current.id))
    .returning()

  const [activeRegistrations, refundableRegistrations] = await Promise.all([
    db
      .update(registrations)
      .set({
        status: 'cancelled',
        updatedAt: now,
      })
      .where(
        and(
          eq(registrations.eventId, current.id),
          or(
            eq(registrations.status, 'pending'),
            eq(registrations.status, 'approved'),
            eq(registrations.status, 'registered')
          )
        )
      )
      .returning({
        id: registrations.id,
        paymentStatus: registrations.paymentStatus,
      }),
    refundMode === 'full'
      ? db
          .select({
            id: registrations.id,
          })
          .from(registrations)
          .where(
            and(
              eq(registrations.eventId, current.id),
              eq(registrations.paymentStatus, 'completed')
            )
          )
      : Promise.resolve([]),
  ])

  let refundedPayments = 0
  let refundPending = 0
  let refundFailures = 0

  if (refundMode === 'full' && refundableRegistrations.length) {
    const outcomes = await Promise.allSettled(
      refundableRegistrations.map((item) =>
        refundRegistrationPaymentByRegistrationId({
          registrationId: item.id,
          reason: 'Event cancelled by host',
          metadata: {
            source: 'event_cancellation',
            event_id: current.id,
            registration_id: item.id,
          },
        })
      )
    )

    for (const outcome of outcomes) {
      if (outcome.status !== 'fulfilled') {
        refundFailures += 1
        continue
      }

      if (outcome.value.refunded) {
        refundedPayments += 1
        continue
      }

      if (outcome.value.pending) {
        refundPending += 1
      } else {
        refundFailures += 1
      }
    }
  }

  const refundSummary = {
    refundMode,
    refundedPayments,
    pendingRefunds: refundPending,
    failedRefunds: refundFailures,
    cancelledRegistrations: activeRegistrations.length,
  }

  await db.insert(eventUpdates).values({
    eventId: current.id,
    updatedBy: userId,
    updateType: 'cancellation',
    oldValues: { status: current.status },
    newValues: { status: updated.status, ...refundSummary },
  })

  return {
    event: await getEventByShortId(shortId),
    refundSummary,
  }
}

export { createEvent, getEventByShortId, listEvents, updateEventByShortId, cancelEventByShortId }
