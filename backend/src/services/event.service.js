import { and, eq } from 'drizzle-orm'
import { db } from '../config/db.js'
import { events, eventHosts, eventUpdates, users } from '../models/schema.js'
import { generateShortId } from '../utils/shortId.js'
import { generateZoomMeetingLink } from './zoom.service.js'

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

function serializeEvent(event) {
  return {
    ...event,
    ticketPrice: toNumber(event.ticketPrice, 0),
    locationLat: event.locationLat === null ? null : Number(event.locationLat),
    locationLng: event.locationLng === null ? null : Number(event.locationLng),
    zoomMeetingLink: event.googleMeetLink || null,
  }
}

function serializeEventWithCreator(row) {
  if (!row) {
    return null
  }

  const { creatorName, creatorEmail, ...event } = row

  return {
    ...serializeEvent(event),
    creator: {
      id: event.creatorId,
      name: creatorName || null,
      email: creatorEmail || null,
    },
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

  delete normalized.zoomMeetingLink

  return normalized
}

async function findEventRecordByShortId(shortId) {
  assertDb()

  const [event] = await db.select().from(events).where(eq(events.shortId, shortId)).limit(1)
  return event || null
}

async function getEventByShortId(shortId) {
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

  return serializeEventWithCreator(row)
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

  const event = await getEventByShortId(shortId)
  return { event, zoomInfo }
}

async function cancelEventByShortId({ shortId, userId }) {
  assertDb()

  const current = await findEventRecordByShortId(shortId)
  if (!current) {
    const err = new Error('Event not found')
    err.statusCode = 404
    throw err
  }

  await ensureHostAccess(current.id, userId)

  if (current.status === 'cancelled') {
    return await getEventByShortId(shortId)
  }

  const [updated] = await db
    .update(events)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
    })
    .where(eq(events.id, current.id))
    .returning()

  await db.insert(eventUpdates).values({
    eventId: current.id,
    updatedBy: userId,
    updateType: 'cancellation',
    oldValues: { status: current.status },
    newValues: { status: updated.status },
  })

  return await getEventByShortId(shortId)
}

export { createEvent, getEventByShortId, updateEventByShortId, cancelEventByShortId }
