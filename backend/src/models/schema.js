import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  decimal,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const authProviderEnum = pgEnum('auth_provider', ['email', 'google'])

export const locationTypeEnum = pgEnum('location_type', ['physical', 'virtual'])

export const capacityTypeEnum = pgEnum('capacity_type', ['unlimited', 'limited'])

export const eventStatusEnum = pgEnum('event_status', ['draft', 'published', 'cancelled'])

export const hostRoleEnum = pgEnum('host_role', ['creator', 'co_host'])

export const registrationStatusEnum = pgEnum('registration_status', [
  'pending',
  'approved',
  'registered',
  'rejected',
  'cancelled',
])

export const paymentStatusEnum = pgEnum('payment_status', [
  'not_required',
  'pending',
  'completed',
  'refunded',
])

export const questionTypeEnum = pgEnum('question_type', ['text', 'multiple_choice', 'checkbox'])

export const verificationPurposeEnum = pgEnum('verification_purpose', [
  'account',
  'event_registration',
])

export const paymentGatewayStatusEnum = pgEnum('payment_gateway_status', [
  'pending',
  'completed',
  'failed',
  'refunded',
])

export const eventUpdateTypeEnum = pgEnum('event_update_type', [
  'details',
  'date_time',
  'location',
  'cancellation',
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  socialProfileLink: varchar('social_profile_link', { length: 500 }),
  emailVerified: boolean('email_verified').notNull().default(false),
  authProvider: authProviderEnum('auth_provider').notNull().default('email'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shortId: varchar('short_id', { length: 20 }).notNull().unique(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    photoUrl: text('photo_url'),
    startDatetime: timestamp('start_datetime', { withTimezone: true }).notNull(),
    endDatetime: timestamp('end_datetime', { withTimezone: true }).notNull(),
    timezone: varchar('timezone', { length: 100 }).notNull(),
    locationType: locationTypeEnum('location_type').notNull().default('physical'),
    locationAddress: text('location_address'),
    locationLat: decimal('location_lat', { precision: 10, scale: 7 }),
    locationLng: decimal('location_lng', { precision: 10, scale: 7 }),
    googleMeetLink: varchar('google_meet_link', { length: 500 }),
    ticketPrice: decimal('ticket_price', { precision: 10, scale: 2 }).notNull().default('0'),
    isPaid: boolean('is_paid').notNull().default(false),
    requireApproval: boolean('require_approval').notNull().default(false),
    capacityType: capacityTypeEnum('capacity_type').notNull().default('unlimited'),
    capacityLimit: integer('capacity_limit'),
    status: eventStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_events_creator').on(table.creatorId),
    index('idx_events_start_datetime').on(table.startDatetime),
    index('idx_events_status').on(table.status),
    uniqueIndex('idx_events_short_id').on(table.shortId),
  ]
)

export const eventHosts = pgTable(
  'event_hosts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: hostRoleEnum('role').notNull().default('co_host'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_event_hosts_event_user').on(table.eventId, table.userId)]
)

export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    socialProfileLink: varchar('social_profile_link', { length: 500 }),
    status: registrationStatusEnum('status').notNull().default('pending'),
    qrCode: text('qr_code'),
    checkedIn: boolean('checked_in').notNull().default(false),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('not_required'),
    paymentId: varchar('payment_id', { length: 255 }),
    registrationResponses: jsonb('registration_responses'),
    emailVerified: boolean('email_verified').notNull().default(false),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_registrations_event_email').on(table.eventId, table.email),
    index('idx_registrations_event').on(table.eventId),
    index('idx_registrations_user').on(table.userId),
    index('idx_registrations_status').on(table.status),
    index('idx_registrations_email').on(table.email),
  ]
)

export const registrationQuestions = pgTable(
  'registration_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    questionText: text('question_text').notNull(),
    questionType: questionTypeEnum('question_type').notNull().default('text'),
    options: jsonb('options'),
    isRequired: boolean('is_required').notNull().default(false),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_reg_questions_event').on(table.eventId)]
)

export const emailBlasts = pgTable(
  'email_blasts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    sentBy: uuid('sent_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subject: varchar('subject', { length: 255 }).notNull(),
    content: text('content').notNull(),
    recipientCount: integer('recipient_count').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_email_blasts_event').on(table.eventId)]
)

export const emailVerifications = pgTable(
  'email_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    purpose: verificationPurposeEnum('purpose').notNull().default('account'),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    registrationId: uuid('registration_id').references(() => registrations.id, {
      onDelete: 'cascade',
    }),
    otp: varchar('otp', { length: 10 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    verified: boolean('verified').notNull().default(false),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_email_verifications_email').on(table.email),
    index('idx_email_verifications_context').on(table.email, table.purpose, table.eventId),
  ]
)

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 500 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_refresh_tokens_user').on(table.userId),
    index('idx_refresh_tokens_token').on(table.token),
  ]
)

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 500 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_password_reset_tokens_token').on(table.token)]
)

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 10 }).notNull().default('USD'),
    paymentGatewayId: varchar('payment_gateway_id', { length: 255 }),
    status: paymentGatewayStatusEnum('status').notNull().default('pending'),
    paymentMethod: varchar('payment_method', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payments_registration').on(table.registrationId),
    index('idx_payments_status').on(table.status),
  ]
)

export const eventUpdates = pgTable(
  'event_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    updateType: eventUpdateTypeEnum('update_type').notNull(),
    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_event_updates_event').on(table.eventId)]
)

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}))

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}))

export const usersRelations = relations(users, ({ many }) => ({
  createdEvents: many(events),
  eventHosts: many(eventHosts),
  registrations: many(registrations),
  emailBlasts: many(emailBlasts),
  eventUpdates: many(eventUpdates),
  refreshTokens: many(refreshTokens),
  passwordResetTokens: many(passwordResetTokens),
}))

export const eventsRelations = relations(events, ({ one, many }) => ({
  creator: one(users, {
    fields: [events.creatorId],
    references: [users.id],
  }),
  hosts: many(eventHosts),
  registrations: many(registrations),
  registrationQuestions: many(registrationQuestions),
  emailBlasts: many(emailBlasts),
  updates: many(eventUpdates),
}))

export const eventHostsRelations = relations(eventHosts, ({ one }) => ({
  event: one(events, {
    fields: [eventHosts.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventHosts.userId],
    references: [users.id],
  }),
}))

export const registrationsRelations = relations(registrations, ({ one, many }) => ({
  event: one(events, {
    fields: [registrations.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [registrations.userId],
    references: [users.id],
  }),
  payments: many(payments),
}))

export const registrationQuestionsRelations = relations(registrationQuestions, ({ one }) => ({
  event: one(events, {
    fields: [registrationQuestions.eventId],
    references: [events.id],
  }),
}))

export const emailBlastsRelations = relations(emailBlasts, ({ one }) => ({
  event: one(events, {
    fields: [emailBlasts.eventId],
    references: [events.id],
  }),
  sender: one(users, {
    fields: [emailBlasts.sentBy],
    references: [users.id],
  }),
}))

export const paymentsRelations = relations(payments, ({ one }) => ({
  registration: one(registrations, {
    fields: [payments.registrationId],
    references: [registrations.id],
  }),
}))

export const eventUpdatesRelations = relations(eventUpdates, ({ one }) => ({
  event: one(events, {
    fields: [eventUpdates.eventId],
    references: [events.id],
  }),
  updater: one(users, {
    fields: [eventUpdates.updatedBy],
    references: [users.id],
  }),
}))
