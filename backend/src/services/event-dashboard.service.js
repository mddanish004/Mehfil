import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { db } from '../config/db.js'
import env from '../config/env.js'
import {
  emailBlasts,
  eventHosts,
  events,
  payments,
  registrationQuestions,
  registrations,
  users,
} from '../models/schema.js'
import { sendEventBlastEmail, sendEventInvitationEmail } from './email.service.js'

const ACTIVE_GUEST_STATUSES = ['pending', 'approved', 'registered']
const ALL_GUEST_STATUSES = ['pending', 'approved', 'registered', 'rejected', 'cancelled']

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

function normalizeEmail(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    const err = new Error('Valid email is required')
    err.statusCode = 400
    throw err
  }
  return normalized
}

function normalizeEmailList(values, maxItems = 500) {
  if (!Array.isArray(values) || values.length === 0) {
    const err = new Error('At least one recipient email is required')
    err.statusCode = 400
    throw err
  }

  const unique = [...new Set(values.map((value) => normalizeEmail(value)))]
  if (unique.length > maxItems) {
    const err = new Error(`A maximum of ${maxItems} recipients is allowed`)
    err.statusCode = 400
    throw err
  }

  return unique
}

function stripHtml(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return ''
  }

  const raw = String(value)
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`
  }

  return raw
}

function buildCsv(headers, rows) {
  const headerRow = headers.join(',')
  const bodyRows = rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
  return [headerRow, ...bodyRows].join('\n')
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

function serializeHostRow(row) {
  return {
    role: row.role,
    addedAt: row.addedAt,
    user: {
      id: row.userId,
      name: row.userName,
      email: row.userEmail,
      avatarUrl: row.userAvatarUrl,
    },
  }
}

function serializeRegistrationQuestion(row) {
  const options = Array.isArray(row.options)
    ? row.options.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : []

  return {
    id: row.id,
    eventId: row.eventId,
    questionText: row.questionText,
    questionType: row.questionType,
    options,
    isRequired: Boolean(row.isRequired),
    orderIndex: Number(row.orderIndex || 0),
    createdAt: row.createdAt,
  }
}

function serializeGuestRow(row) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    socialProfileLink: row.socialProfileLink,
    status: row.status,
    emailVerified: Boolean(row.emailVerified),
    checkedIn: Boolean(row.checkedIn),
    checkedInAt: row.checkedInAt,
    paymentStatus: row.paymentStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function serializeBlastRow(row) {
  return {
    id: row.id,
    subject: row.subject,
    content: row.content,
    contentPreview: stripHtml(row.content).slice(0, 200),
    recipientCount: Number(row.recipientCount || 0),
    sentAt: row.sentAt,
    sentBy: {
      id: row.sentByUserId,
      name: row.sentByUserName,
      email: row.sentByUserEmail,
    },
  }
}

function buildGuestWhereClause(eventId, filters = {}) {
  const conditions = [eq(registrations.eventId, eventId)]

  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(registrations.status, filters.status))
  }

  if (filters.search) {
    const query = `%${filters.search}%`
    conditions.push(
      or(
        ilike(registrations.name, query),
        ilike(registrations.email, query),
        ilike(registrations.phone, query)
      )
    )
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions)
}

function getGuestSortOrder(sortBy = 'createdAt', sortOrder = 'desc') {
  const sortableFields = {
    createdAt: registrations.createdAt,
    updatedAt: registrations.updatedAt,
    name: registrations.name,
    email: registrations.email,
    status: registrations.status,
  }

  const sortColumn = sortableFields[sortBy] || registrations.createdAt
  const dir = sortOrder === 'asc' ? asc : desc
  return [dir(sortColumn), desc(registrations.createdAt)]
}

async function getEventWithHostAccess(shortId, userId) {
  assertDb()

  const [event] = await db.select().from(events).where(eq(events.shortId, shortId)).limit(1)
  if (!event) {
    const err = new Error('Event not found')
    err.statusCode = 404
    throw err
  }

  const [host] = await db
    .select({ id: eventHosts.id })
    .from(eventHosts)
    .where(and(eq(eventHosts.eventId, event.id), eq(eventHosts.userId, userId)))
    .limit(1)

  if (!host) {
    const err = new Error('You do not have permission to manage this event')
    err.statusCode = 403
    throw err
  }

  return event
}

async function assertHostAccessByShortId({ shortId, userId }) {
  return getEventWithHostAccess(shortId, userId)
}

async function listHostsForEvent(eventId) {
  const rows = await db
    .select({
      role: eventHosts.role,
      addedAt: eventHosts.createdAt,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      userAvatarUrl: users.avatarUrl,
      rolePriority: sql`case when ${eventHosts.role} = 'creator' then 0 else 1 end`,
    })
    .from(eventHosts)
    .innerJoin(users, eq(eventHosts.userId, users.id))
    .where(eq(eventHosts.eventId, eventId))
    .orderBy(sql`case when ${eventHosts.role} = 'creator' then 0 else 1 end`, asc(users.name))

  return rows.map(({ rolePriority, ...row }) => serializeHostRow(row))
}

async function getGuestStatsForEvent(eventId) {
  const rows = await db
    .select({
      status: registrations.status,
      total: sql`count(*)::int`,
      checkedIn: sql`sum(case when ${registrations.checkedIn} then 1 else 0 end)::int`,
      emailVerified: sql`sum(case when ${registrations.emailVerified} then 1 else 0 end)::int`,
    })
    .from(registrations)
    .where(eq(registrations.eventId, eventId))
    .groupBy(registrations.status)

  const stats = {
    total: 0,
    pending: 0,
    approved: 0,
    registered: 0,
    rejected: 0,
    cancelled: 0,
    checkedIn: 0,
    emailVerified: 0,
  }

  for (const row of rows) {
    const status = row.status
    const total = toNumber(row.total, 0)
    stats.total += total
    stats.checkedIn += toNumber(row.checkedIn, 0)
    stats.emailVerified += toNumber(row.emailVerified, 0)
    if (status in stats) {
      stats[status] = total
    }
  }

  return stats
}

async function listGuestsForEvent(eventId, filters = {}) {
  const page = Math.max(1, Number(filters.page || 1))
  const limit = Math.min(100, Math.max(1, Number(filters.limit || 20)))
  const offset = (page - 1) * limit
  const whereClause = buildGuestWhereClause(eventId, filters)
  const sortOrder = getGuestSortOrder(filters.sortBy, filters.sortOrder)

  const [countResult, rows] = await Promise.all([
    db
      .select({
        total: sql`count(*)::int`,
      })
      .from(registrations)
      .where(whereClause),
    db
      .select({
        id: registrations.id,
        userId: registrations.userId,
        name: registrations.name,
        email: registrations.email,
        phone: registrations.phone,
        socialProfileLink: registrations.socialProfileLink,
        status: registrations.status,
        emailVerified: registrations.emailVerified,
        checkedIn: registrations.checkedIn,
        checkedInAt: registrations.checkedInAt,
        paymentStatus: registrations.paymentStatus,
        createdAt: registrations.createdAt,
        updatedAt: registrations.updatedAt,
      })
      .from(registrations)
      .where(whereClause)
      .orderBy(...sortOrder)
      .limit(limit)
      .offset(offset),
  ])

  const total = toNumber(countResult?.[0]?.total, 0)
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0

  return {
    rows: rows.map(serializeGuestRow),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page * limit < total,
    },
  }
}

async function listAllGuestsForExport(eventId, filters = {}) {
  const whereClause = buildGuestWhereClause(eventId, filters)
  const sortOrder = getGuestSortOrder(filters.sortBy, filters.sortOrder)

  const rows = await db
    .select({
      id: registrations.id,
      name: registrations.name,
      email: registrations.email,
      phone: registrations.phone,
      status: registrations.status,
      emailVerified: registrations.emailVerified,
      checkedIn: registrations.checkedIn,
      paymentStatus: registrations.paymentStatus,
      createdAt: registrations.createdAt,
      updatedAt: registrations.updatedAt,
    })
    .from(registrations)
    .where(whereClause)
    .orderBy(...sortOrder)

  return rows
}

async function listRegistrationQuestionsForEvent(eventId) {
  const rows = await db
    .select()
    .from(registrationQuestions)
    .where(eq(registrationQuestions.eventId, eventId))
    .orderBy(asc(registrationQuestions.orderIndex), asc(registrationQuestions.createdAt))

  return rows.map(serializeRegistrationQuestion)
}

async function listBlastHistoryForEvent(eventId, filters = {}) {
  const page = Math.max(1, Number(filters.page || 1))
  const limit = Math.min(100, Math.max(1, Number(filters.limit || 20)))
  const offset = (page - 1) * limit

  const [countResult, rows] = await Promise.all([
    db
      .select({ total: sql`count(*)::int` })
      .from(emailBlasts)
      .where(eq(emailBlasts.eventId, eventId)),
    db
      .select({
        id: emailBlasts.id,
        subject: emailBlasts.subject,
        content: emailBlasts.content,
        recipientCount: emailBlasts.recipientCount,
        sentAt: emailBlasts.sentAt,
        sentByUserId: users.id,
        sentByUserName: users.name,
        sentByUserEmail: users.email,
      })
      .from(emailBlasts)
      .innerJoin(users, eq(emailBlasts.sentBy, users.id))
      .where(eq(emailBlasts.eventId, eventId))
      .orderBy(desc(emailBlasts.sentAt))
      .limit(limit)
      .offset(offset),
  ])

  const total = toNumber(countResult?.[0]?.total, 0)
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0

  return {
    history: rows.map(serializeBlastRow),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page * limit < total,
    },
  }
}

async function getPaymentSummaryForEvent(eventId) {
  const rows = await db
    .select({
      status: payments.status,
      amount: payments.amount,
    })
    .from(payments)
    .innerJoin(registrations, eq(payments.registrationId, registrations.id))
    .where(eq(registrations.eventId, eventId))

  const summary = {
    totalAmountCollected: 0,
    refundableAmount: 0,
    refundedAmount: 0,
    completedPayments: 0,
    refundedPayments: 0,
  }

  for (const row of rows) {
    const amount = toNumber(row.amount, 0)
    if (row.status === 'completed') {
      summary.totalAmountCollected += amount
      summary.refundableAmount += amount
      summary.completedPayments += 1
    } else if (row.status === 'refunded') {
      summary.refundedAmount += amount
      summary.refundedPayments += 1
    }
  }

  summary.totalAmountCollected = Number(summary.totalAmountCollected.toFixed(2))
  summary.refundableAmount = Number(summary.refundableAmount.toFixed(2))
  summary.refundedAmount = Number(summary.refundedAmount.toFixed(2))

  return summary
}

async function getEventDashboardByShortId({ shortId, userId, guestFilters = {}, blastFilters = {} }) {
  const event = await getEventWithHostAccess(shortId, userId)

  const [hosts, guestStats, guests, questions, blast, paymentSummary] = await Promise.all([
    listHostsForEvent(event.id),
    getGuestStatsForEvent(event.id),
    listGuestsForEvent(event.id, guestFilters),
    listRegistrationQuestionsForEvent(event.id),
    listBlastHistoryForEvent(event.id, blastFilters),
    getPaymentSummaryForEvent(event.id),
  ])

  const activeGuestCount = ACTIVE_GUEST_STATUSES.reduce(
    (sum, status) => sum + toNumber(guestStats[status], 0),
    0
  )

  const capacityRemaining =
    event.capacityType === 'limited' && event.capacityLimit !== null
      ? Math.max(0, Number(event.capacityLimit) - activeGuestCount)
      : null

  return {
    overview: {
      event: serializeEvent(event),
      summary: {
        totalGuests: guestStats.total,
        pendingGuests: guestStats.pending,
        approvedGuests: guestStats.approved,
        registeredGuests: guestStats.registered,
        rejectedGuests: guestStats.rejected,
        cancelledGuests: guestStats.cancelled,
        checkedInGuests: guestStats.checkedIn,
        emailVerifiedGuests: guestStats.emailVerified,
        activeGuests: activeGuestCount,
        capacityRemaining,
      },
      quickActions: {
        inviteEndpoint: `/events/${event.shortId}/invite`,
        shareUrl: `${env.CLIENT_URL}/events/${event.shortId}`,
      },
      coHosts: hosts,
    },
    guests: {
      statistics: guestStats,
      filters: {
        status: guestFilters.status || 'all',
        search: guestFilters.search || '',
        sortBy: guestFilters.sortBy || 'createdAt',
        sortOrder: guestFilters.sortOrder || 'desc',
      },
      list: guests.rows,
      pagination: guests.pagination,
      exportCsvEndpoint: `/events/${event.shortId}/dashboard?format=csv`,
    },
    registration: {
      requireApproval: Boolean(event.requireApproval),
      emailTemplate: {
        subjectTemplate: 'Registration update: {{eventName}}',
        bodyTemplate:
          '<p>Hi {{guestName}},</p><p>Your registration status for <strong>{{eventName}}</strong> has been updated.</p>',
        placeholders: ['{{guestName}}', '{{eventName}}', '{{eventDate}}', '{{eventLocation}}'],
      },
      customQuestions: questions,
      updateEndpoint: `/events/${event.shortId}`,
      supportsDragAndDropReordering: true,
    },
    blast: {
      recipientGroups: [
        {
          key: 'all',
          label: 'All active guests',
          count: activeGuestCount,
        },
        {
          key: 'pending',
          label: 'Pending guests',
          count: guestStats.pending,
        },
        {
          key: 'approved',
          label: 'Approved guests',
          count: guestStats.approved,
        },
        {
          key: 'registered',
          label: 'Registered guests',
          count: guestStats.registered,
        },
        {
          key: 'rejected',
          label: 'Rejected guests',
          count: guestStats.rejected,
        },
      ],
      history: blast.history,
      pagination: blast.pagination,
      composer: {
        supportsRichText: true,
        maxSubjectLength: 255,
        endpoint: `/events/${event.shortId}/blast`,
      },
    },
    more: {
      cancellation: {
        canCancel: event.status !== 'cancelled',
        status: event.status,
        endpoint: `/events/${event.shortId}`,
        refundHandling: {
          options: ['none', 'full'],
          paymentSummary,
        },
      },
    },
  }
}

async function exportEventGuestsCsvByShortId({ shortId, userId, guestFilters = {} }) {
  const event = await getEventWithHostAccess(shortId, userId)
  const rows = await listAllGuestsForExport(event.id, guestFilters)

  const csv = buildCsv(
    [
      'registrationId',
      'name',
      'email',
      'phone',
      'status',
      'emailVerified',
      'checkedIn',
      'paymentStatus',
      'createdAt',
      'updatedAt',
    ],
    rows.map((row) => [
      row.id,
      row.name,
      row.email,
      row.phone || '',
      row.status,
      Boolean(row.emailVerified),
      Boolean(row.checkedIn),
      row.paymentStatus,
      row.createdAt?.toISOString?.() || row.createdAt,
      row.updatedAt?.toISOString?.() || row.updatedAt,
    ])
  )

  return {
    filename: `${event.shortId}-guests.csv`,
    csv,
  }
}

async function listEventHostsByShortId({ shortId, userId }) {
  const event = await getEventWithHostAccess(shortId, userId)
  const hosts = await listHostsForEvent(event.id)

  return {
    event: serializeEvent(event),
    hosts,
  }
}

async function findUserByIdentifier({ userId = null, email = null }) {
  if (userId) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    return user || null
  }

  if (email) {
    const normalizedEmail = normalizeEmail(email)
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1)
    return user || null
  }

  return null
}

async function addEventHostByShortId({ shortId, actorUserId, userId = null, email = null }) {
  const event = await getEventWithHostAccess(shortId, actorUserId)

  if (event.creatorId !== actorUserId) {
    const err = new Error('Only the event creator can manage co-hosts')
    err.statusCode = 403
    throw err
  }

  const user = await findUserByIdentifier({ userId, email })
  if (!user) {
    const err = new Error('User not found')
    err.statusCode = 404
    throw err
  }

  if (user.id === event.creatorId) {
    const err = new Error('Event creator is already a host')
    err.statusCode = 400
    throw err
  }

  const [existing] = await db
    .select({ id: eventHosts.id })
    .from(eventHosts)
    .where(and(eq(eventHosts.eventId, event.id), eq(eventHosts.userId, user.id)))
    .limit(1)

  if (!existing) {
    await db.insert(eventHosts).values({
      eventId: event.id,
      userId: user.id,
      role: 'co_host',
    })
  }

  const hosts = await listHostsForEvent(event.id)
  return {
    event: serializeEvent(event),
    hosts,
  }
}

async function removeEventHostByShortId({ shortId, actorUserId, userId = null, email = null }) {
  const event = await getEventWithHostAccess(shortId, actorUserId)

  if (event.creatorId !== actorUserId) {
    const err = new Error('Only the event creator can manage co-hosts')
    err.statusCode = 403
    throw err
  }

  const user = await findUserByIdentifier({ userId, email })
  if (!user) {
    const err = new Error('User not found')
    err.statusCode = 404
    throw err
  }

  if (user.id === event.creatorId) {
    const err = new Error('Event creator cannot be removed from hosts')
    err.statusCode = 400
    throw err
  }

  const deleted = await db
    .delete(eventHosts)
    .where(and(eq(eventHosts.eventId, event.id), eq(eventHosts.userId, user.id)))
    .returning({ id: eventHosts.id })

  if (!deleted.length) {
    const err = new Error('Host not found for this event')
    err.statusCode = 404
    throw err
  }

  const hosts = await listHostsForEvent(event.id)
  return {
    event: serializeEvent(event),
    hosts,
  }
}

async function inviteGuestsByShortId({
  shortId,
  userId,
  recipientEmails,
  subject = null,
  message = null,
}) {
  const event = await getEventWithHostAccess(shortId, userId)
  const recipients = normalizeEmailList(recipientEmails, 200)

  const [inviter] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
  const inviterName = inviter?.name || null

  const settled = await Promise.allSettled(
    recipients.map((email) =>
      sendEventInvitationEmail({
        email,
        event,
        inviterName,
        subject,
        message,
      })
    )
  )

  let sent = 0
  const failures = []

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sent += 1
      return
    }
    failures.push({
      email: recipients[index],
      error: result.reason?.message || 'Failed to send invite',
    })
  })

  return {
    attempted: recipients.length,
    sent,
    failed: failures.length,
    failures,
    shareUrl: `${env.CLIENT_URL}/events/${event.shortId}`,
  }
}

async function getEventBlastByShortId({ shortId, userId, page = 1, limit = 20 }) {
  const event = await getEventWithHostAccess(shortId, userId)
  const [guestStats, blast] = await Promise.all([
    getGuestStatsForEvent(event.id),
    listBlastHistoryForEvent(event.id, { page, limit }),
  ])

  const activeGuestCount = ACTIVE_GUEST_STATUSES.reduce(
    (sum, status) => sum + toNumber(guestStats[status], 0),
    0
  )

  return {
    recipientGroups: [
      { key: 'all', label: 'All active guests', count: activeGuestCount },
      { key: 'pending', label: 'Pending guests', count: guestStats.pending },
      { key: 'approved', label: 'Approved guests', count: guestStats.approved },
      { key: 'registered', label: 'Registered guests', count: guestStats.registered },
      { key: 'rejected', label: 'Rejected guests', count: guestStats.rejected },
      { key: 'cancelled', label: 'Cancelled guests', count: guestStats.cancelled },
    ],
    history: blast.history,
    pagination: blast.pagination,
  }
}

async function getBlastRecipients(eventId, payload) {
  if (payload.type === 'emails') {
    return normalizeEmailList(payload.emails || [], 500)
  }

  let whereClause = eq(registrations.eventId, eventId)

  if (payload.type === 'all') {
    whereClause = and(
      eq(registrations.eventId, eventId),
      inArray(registrations.status, ACTIVE_GUEST_STATUSES),
      eq(registrations.emailVerified, true)
    )
  } else if (payload.type === 'status') {
    const statuses = Array.isArray(payload.statuses) ? payload.statuses.filter(Boolean) : []
    if (!statuses.length) {
      const err = new Error('At least one status is required for status-based recipients')
      err.statusCode = 400
      throw err
    }
    whereClause = and(
      eq(registrations.eventId, eventId),
      inArray(registrations.status, statuses),
      eq(registrations.emailVerified, true)
    )
  } else if (payload.type === 'registrations') {
    const registrationIds = Array.isArray(payload.registrationIds)
      ? payload.registrationIds.filter(Boolean)
      : []
    if (!registrationIds.length) {
      const err = new Error('At least one registration is required')
      err.statusCode = 400
      throw err
    }
    whereClause = and(
      eq(registrations.eventId, eventId),
      inArray(registrations.id, registrationIds),
      eq(registrations.emailVerified, true)
    )
  } else {
    const err = new Error('Invalid recipient selector')
    err.statusCode = 400
    throw err
  }

  const rows = await db
    .select({
      email: registrations.email,
    })
    .from(registrations)
    .where(whereClause)

  return [...new Set(rows.map((row) => normalizeEmail(row.email)))]
}

async function sendEventBlastByShortId({ shortId, userId, subject, content, recipients }) {
  const event = await getEventWithHostAccess(shortId, userId)
  const recipientEmails = await getBlastRecipients(event.id, recipients)

  if (!recipientEmails.length) {
    const err = new Error('No recipients matched your selection')
    err.statusCode = 400
    throw err
  }

  const settled = await Promise.allSettled(
    recipientEmails.map((email) =>
      sendEventBlastEmail({
        email,
        subject,
        content,
        event,
      })
    )
  )

  let sent = 0
  const failures = []

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sent += 1
      return
    }

    failures.push({
      email: recipientEmails[index],
      error: result.reason?.message || 'Failed to send blast',
    })
  })

  const [createdBlast] = await db
    .insert(emailBlasts)
    .values({
      eventId: event.id,
      sentBy: userId,
      subject,
      content,
      recipientCount: sent,
    })
    .returning()

  const [sender] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return {
    blast: {
      id: createdBlast.id,
      subject: createdBlast.subject,
      content: createdBlast.content,
      contentPreview: stripHtml(createdBlast.content).slice(0, 200),
      recipientCount: Number(createdBlast.recipientCount || 0),
      sentAt: createdBlast.sentAt,
      sentBy: sender || null,
    },
    delivery: {
      attempted: recipientEmails.length,
      sent,
      failed: failures.length,
      failures,
    },
  }
}

export {
  getEventDashboardByShortId,
  exportEventGuestsCsvByShortId,
  listEventHostsByShortId,
  addEventHostByShortId,
  removeEventHostByShortId,
  inviteGuestsByShortId,
  getEventBlastByShortId,
  sendEventBlastByShortId,
  ALL_GUEST_STATUSES,
  assertHostAccessByShortId,
}
