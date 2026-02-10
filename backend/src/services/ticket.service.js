import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { db } from '../config/db.js'
import env from '../config/env.js'
import { eventHosts, events, registrations } from '../models/schema.js'

const TICKET_ELIGIBLE_STATUSES = ['approved', 'registered']

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

function toTicketUrl(registrationId) {
  return `${env.CLIENT_URL}/registrations/${registrationId}/ticket`
}

function getGuestId({ userId, email }) {
  if (userId) {
    return userId
  }

  const normalizedEmail = normalizeEmail(email)
  const hashed = crypto.createHash('sha256').update(normalizedEmail).digest('hex')
  return `guest_${hashed.slice(0, 16)}`
}

function createChecksum({ eventId, registrationId, guestId }) {
  return crypto
    .createHash('sha256')
    .update(`${eventId}:${registrationId}:${guestId}:${env.JWT_SECRET}`)
    .digest('hex')
    .slice(0, 16)
}

function createQrPayload({ eventId, registrationId, guestId }) {
  return {
    eventId,
    registrationId,
    guestId,
    checksum: createChecksum({ eventId, registrationId, guestId }),
  }
}

function parseQrPayload(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    const keys = ['eventId', 'registrationId', 'guestId', 'checksum']
    const validShape = keys.every((key) => typeof parsed[key] === 'string' && parsed[key].trim())
    if (!validShape) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function isQrPayloadValid(payload, registration) {
  if (!payload) {
    return false
  }

  if (payload.eventId !== registration.eventId || payload.registrationId !== registration.id) {
    return false
  }

  const expectedGuestId = getGuestId({
    userId: registration.userId,
    email: registration.email,
  })

  if (payload.guestId !== expectedGuestId) {
    return false
  }

  const expectedChecksum = createChecksum({
    eventId: payload.eventId,
    registrationId: payload.registrationId,
    guestId: payload.guestId,
  })

  return payload.checksum === expectedChecksum
}

function isTicketEligible(registration) {
  return Boolean(registration?.emailVerified) && TICKET_ELIGIBLE_STATUSES.includes(registration?.status)
}

function canAccessRegistrationTicket(row, viewer) {
  const viewerUserId = viewer?.userId || null
  const viewerEmail = normalizeEmail(viewer?.email)
  const registrationEmail = normalizeEmail(row.registration.email)

  if (viewerUserId && row.registration.userId === viewerUserId) {
    return true
  }

  if (viewerEmail && viewerEmail === registrationEmail) {
    return true
  }

  return false
}

async function hasHostAccess(eventId, userId) {
  if (!userId) {
    return false
  }

  const [host] = await db
    .select({ id: eventHosts.id })
    .from(eventHosts)
    .where(and(eq(eventHosts.eventId, eventId), eq(eventHosts.userId, userId)))
    .limit(1)

  return Boolean(host)
}

function formatDateTime(datetime, timezone) {
  const date = new Date(datetime)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone || 'UTC',
  }).format(date)
}

function mapTicketPayload({ registration, event, qrPayload, qrDataUrl }) {
  return {
    registrationId: registration.id,
    eventId: event.id,
    eventShortId: event.shortId,
    eventName: event.name,
    eventStartDatetime: event.startDatetime,
    eventEndDatetime: event.endDatetime,
    timezone: event.timezone,
    locationType: event.locationType,
    locationAddress: event.locationAddress,
    registrationStatus: registration.status,
    attendeeName: registration.name,
    attendeeEmail: registration.email,
    checkedIn: Boolean(registration.checkedIn),
    checkedInAt: registration.checkedInAt,
    ticketUrl: toTicketUrl(registration.id),
    qrPayload,
    qrDataUrl,
  }
}

function parseDataUrlBuffer(dataUrl) {
  const [, encoded] = String(dataUrl || '').split(',')
  if (!encoded) {
    return Buffer.alloc(0)
  }

  return Buffer.from(encoded, 'base64')
}

async function generateQrDataUrl(qrPayloadString) {
  return QRCode.toDataURL(qrPayloadString, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    margin: 1,
    width: 360,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  })
}

async function ensureRegistrationQrCode(registration) {
  assertDb()

  const parsed = parseQrPayload(registration.qrCode)
  if (isQrPayloadValid(parsed, registration)) {
    return JSON.stringify(parsed)
  }

  const guestId = getGuestId({
    userId: registration.userId,
    email: registration.email,
  })

  const payload = createQrPayload({
    eventId: registration.eventId,
    registrationId: registration.id,
    guestId,
  })

  const qrCode = JSON.stringify(payload)

  await db
    .update(registrations)
    .set({
      qrCode,
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, registration.id))

  return qrCode
}

function generateTicketPdf(ticket) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks = []

    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const qrBuffer = parseDataUrlBuffer(ticket.qrDataUrl)
    const startText = formatDateTime(ticket.eventStartDatetime, ticket.timezone)
    const endText = formatDateTime(ticket.eventEndDatetime, ticket.timezone)
    const locationText =
      ticket.locationType === 'virtual'
        ? 'Virtual'
        : ticket.locationAddress || 'Location details will be shared by host'

    doc.fillColor('#111111').fontSize(26).text('Mehfil Event Ticket')
    doc.moveDown(0.4)
    doc.fontSize(11).fillColor('#555555').text(`Ticket ID: ${ticket.registrationId}`)
    doc.moveDown(1.2)

    doc.fontSize(20).fillColor('#111111').text(ticket.eventName)
    doc.moveDown(0.8)

    doc.fontSize(12).fillColor('#222222').text(`Attendee: ${ticket.attendeeName}`)
    doc.moveDown(0.35)
    doc.text(`Email: ${ticket.attendeeEmail}`)
    doc.moveDown(0.35)
    doc.text(`Date: ${startText} to ${endText}`)
    doc.moveDown(0.35)
    doc.text(`Timezone: ${ticket.timezone}`)
    doc.moveDown(0.35)
    doc.text(`Location: ${locationText}`)
    doc.moveDown(0.35)
    doc.text(`Status: ${ticket.registrationStatus}`)
    doc.moveDown(1.2)

    if (qrBuffer.length) {
      const qrX = (doc.page.width - 240) / 2
      doc.roundedRect(qrX - 10, doc.y - 10, 260, 260, 8).lineWidth(1).stroke('#111111')
      doc.image(qrBuffer, qrX, doc.y, { fit: [240, 240], align: 'center' })
      doc.moveDown(11)
    }

    doc.fontSize(10).fillColor('#666666').text('Present this QR code at check-in for entry.', {
      align: 'center',
    })
    doc.moveDown(0.5)
    doc.fontSize(10).text(ticket.ticketUrl, { align: 'center' })

    doc.end()
  })
}

async function createTicketData({ registration, event, includePdf = false }) {
  const qrCode = await ensureRegistrationQrCode(registration)
  const qrPayload = JSON.parse(qrCode)
  const qrDataUrl = await generateQrDataUrl(qrCode)
  const ticket = mapTicketPayload({
    registration,
    event,
    qrPayload,
    qrDataUrl,
  })

  if (!includePdf) {
    return { ticket, qrPayload, qrDataUrl }
  }

  const pdfBuffer = await generateTicketPdf(ticket)
  return { ticket, qrPayload, qrDataUrl, pdfBuffer }
}

async function getRegistrationTicketById({ registrationId, viewer, includePdf = false }) {
  assertDb()

  if (!viewer?.userId && !viewer?.email) {
    const err = new Error('Authentication required')
    err.statusCode = 401
    throw err
  }

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

  let allowed = canAccessRegistrationTicket(row, viewer)
  if (!allowed && viewer.userId) {
    allowed = await hasHostAccess(row.event.id, viewer.userId)
  }

  if (!allowed) {
    const err = new Error('You do not have permission to view this ticket')
    err.statusCode = 403
    throw err
  }

  if (!isTicketEligible(row.registration)) {
    const err = new Error('Ticket is not available for this registration yet')
    err.statusCode = 400
    throw err
  }

  return createTicketData({
    registration: row.registration,
    event: row.event,
    includePdf,
  })
}

export {
  createTicketData,
  ensureRegistrationQrCode,
  getRegistrationTicketById,
  isTicketEligible,
}
