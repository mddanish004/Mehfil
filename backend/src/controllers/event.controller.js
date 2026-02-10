import { ZodError, z } from 'zod'
import {
  createEvent,
  getEventByShortId,
  updateEventByShortId,
  cancelEventByShortId,
  listEvents,
} from '../services/event.service.js'
import { uploadEventPhoto } from '../services/upload.service.js'
import { generateZoomMeetingLink } from '../services/zoom.service.js'
import { searchLocations } from '../services/location.service.js'
import {
  approveRegistrationById,
  rejectRegistrationById,
  registerForEvent,
} from '../services/registration.service.js'
import {
  addEventHostByShortId,
  exportEventGuestsCsvByShortId,
  getEventBlastByShortId,
  getEventDashboardByShortId,
  inviteGuestsByShortId,
  listEventHostsByShortId,
  removeEventHostByShortId,
  sendEventBlastByShortId,
  ALL_GUEST_STATUSES,
} from '../services/event-dashboard.service.js'

const registrationQuestionSchema = z
  .object({
    questionText: z.string().trim().min(1).max(500),
    questionType: z.enum(['text', 'multiple_choice', 'checkbox']),
    options: z.array(z.string().trim().min(1).max(200)).max(20).optional().default([]),
    isRequired: z.boolean().optional().default(false),
    orderIndex: z.coerce.number().int().min(0).max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.questionType !== 'text' && data.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choice questions need at least 2 options',
        path: ['options'],
      })
    }
  })

const eventBaseSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().max(10000).optional().nullable(),
  photoUrl: z.string().url().max(2000).optional().nullable(),
  startDatetime: z.coerce.date(),
  endDatetime: z.coerce.date(),
  timezone: z.string().trim().min(1).max(100),
  locationType: z.enum(['physical', 'virtual']),
  locationAddress: z.string().trim().max(500).optional().nullable(),
  locationLat: z.coerce.number().min(-90).max(90).optional().nullable(),
  locationLng: z.coerce.number().min(-180).max(180).optional().nullable(),
  zoomMeetingLink: z.string().url().max(500).optional().nullable(),
  generateZoomLink: z.boolean().optional(),
  ticketPrice: z.coerce.number().min(0).max(1000000).optional(),
  isPaid: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  capacityType: z.enum(['unlimited', 'limited']).optional(),
  capacityLimit: z.coerce.number().int().min(1).max(100000).optional().nullable(),
  status: z.enum(['draft', 'published', 'cancelled']).optional(),
  registrationQuestions: z.array(registrationQuestionSchema).max(20).optional(),
})

const eventSchema = eventBaseSchema.superRefine((data, ctx) => {
  if (data.endDatetime <= data.startDatetime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date/time must be after start date/time',
      path: ['endDatetime'],
    })
  }

  if (data.capacityType === 'limited' && !data.capacityLimit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Capacity limit is required when capacity type is limited',
      path: ['capacityLimit'],
    })
  }

  if (data.isPaid && (!data.ticketPrice || data.ticketPrice <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Paid events must have a ticket price greater than 0',
      path: ['ticketPrice'],
    })
  }
})

const updateEventSchema = eventBaseSchema.partial().superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field is required for update',
    })
  }

  if (data.startDatetime && data.endDatetime && data.endDatetime <= data.startDatetime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date/time must be after start date/time',
      path: ['endDatetime'],
    })
  }

  if (data.capacityType === 'limited' && data.capacityLimit === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Capacity limit is required when capacity type is limited',
      path: ['capacityLimit'],
    })
  }

  if (data.isPaid === true && (data.ticketPrice === undefined || data.ticketPrice <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Paid events must have a ticket price greater than 0',
      path: ['ticketPrice'],
    })
  }
})

const zoomLinkSchema = z.object({
  topic: z.string().trim().max(120).optional(),
  agenda: z.string().max(1000).optional(),
  startDatetime: z.coerce.date().optional(),
  endDatetime: z.coerce.date().optional(),
  timezone: z.string().trim().max(100).optional(),
})

const searchLocationSchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(10).optional(),
})

const listEventsSchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    location: z.string().trim().max(255).optional(),
    priceType: z.enum(['all', 'free', 'paid']).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    status: z.enum(['all', 'draft', 'published', 'cancelled']).optional(),
    sort: z.enum(['date', 'popularity', 'newest']).optional(),
    page: z.coerce.number().int().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startDate && data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must be on or after start date',
        path: ['endDate'],
      })
    }

    if (
      data.minPrice !== undefined &&
      data.maxPrice !== undefined &&
      Number(data.maxPrice) < Number(data.minPrice)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Max price must be greater than or equal to min price',
        path: ['maxPrice'],
      })
    }
  })

const registerForEventSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(50).optional().nullable(),
  socialProfileLink: z
    .string()
    .trim()
    .url()
    .max(500)
    .optional()
    .or(z.literal(''))
    .nullable(),
  registrationResponses: z.record(z.string(), z.any()).optional(),
})

const approveRegistrationParamsSchema = z.object({
  registrationId: z.string().uuid(),
})

const rejectRegistrationParamsSchema = z.object({
  registrationId: z.string().uuid(),
})

const cancelEventSchema = z.object({
  refundMode: z.enum(['none', 'full']).optional().default('none'),
})

const dashboardQuerySchema = z.object({
  format: z.enum(['json', 'csv']).optional(),
  guestSearch: z.string().trim().max(255).optional(),
  guestStatus: z.enum(['all', ...ALL_GUEST_STATUSES]).optional(),
  guestPage: z.coerce.number().int().min(1).optional(),
  guestLimit: z.coerce.number().int().min(1).max(100).optional(),
  guestSortBy: z.enum(['createdAt', 'updatedAt', 'name', 'email', 'status']).optional(),
  guestSortOrder: z.enum(['asc', 'desc']).optional(),
  blastPage: z.coerce.number().int().min(1).optional(),
  blastLimit: z.coerce.number().int().min(1).max(100).optional(),
})

const hostMutationSchema = z
  .object({
    userId: z.string().uuid().optional(),
    email: z.string().trim().email().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.userId && !data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either userId or email is required',
      })
    }
  })

const inviteGuestsSchema = z.object({
  recipientEmails: z.array(z.string().trim().email()).min(1).max(200),
  subject: z.string().trim().min(1).max(255).optional(),
  message: z.string().max(20000).optional().nullable(),
})

const blastRecipientSchema = z
  .object({
    type: z.enum(['all', 'status', 'registrations', 'emails']),
    statuses: z.array(z.enum(ALL_GUEST_STATUSES)).min(1).max(ALL_GUEST_STATUSES.length).optional(),
    registrationIds: z.array(z.string().uuid()).min(1).max(500).optional(),
    emails: z.array(z.string().trim().email()).min(1).max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'status' && !data.statuses?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'statuses are required when type is status',
        path: ['statuses'],
      })
    }

    if (data.type === 'registrations' && !data.registrationIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'registrationIds are required when type is registrations',
        path: ['registrationIds'],
      })
    }

    if (data.type === 'emails' && !data.emails?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'emails are required when type is emails',
        path: ['emails'],
      })
    }
  })

const createBlastSchema = z.object({
  subject: z.string().trim().min(1).max(255),
  content: z.string().min(1).max(100000),
  recipients: blastRecipientSchema,
})

const blastQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
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

async function handleCreateEvent(req, res, next) {
  try {
    const payload = parseSchema(eventSchema, req.body)
    const result = await createEvent({ userId: req.user.id, payload })

    res.status(201).json({
      success: true,
      data: result,
      message: 'Event created successfully',
    })
  } catch (error) {
    next(error)
  }
}

async function handleGetEventByShortId(req, res, next) {
  try {
    const event = await getEventByShortId(req.params.shortId, {
      userId: req.user?.id || null,
      email: req.guest?.email || req.user?.email || null,
    })

    if (!event) {
      return res.status(404).json({
        success: false,
        error: { message: 'Event not found' },
      })
    }

    res.json({
      success: true,
      data: { event },
    })
  } catch (error) {
    next(error)
  }
}

async function handleListEvents(req, res, next) {
  try {
    const parsedFilters = parseSchema(listEventsSchema, req.query || {})
    const filters = { ...parsedFilters }

    if (filters.startDate) {
      const startDate = new Date(filters.startDate)
      startDate.setHours(0, 0, 0, 0)
      filters.startDate = startDate
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate)
      endDate.setHours(23, 59, 59, 999)
      filters.endDate = endDate
    }

    const result = await listEvents({
      userId: req.user?.id || null,
      filters,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

async function handleUpdateEvent(req, res, next) {
  try {
    const payload = parseSchema(updateEventSchema, req.body)
    const result = await updateEventByShortId({
      shortId: req.params.shortId,
      userId: req.user.id,
      payload,
    })

    res.json({
      success: true,
      data: result,
      message: 'Event updated successfully',
    })
  } catch (error) {
    next(error)
  }
}

async function handleDeleteEvent(req, res, next) {
  try {
    const { refundMode } = parseSchema(cancelEventSchema, req.body || {})
    const result = await cancelEventByShortId({
      shortId: req.params.shortId,
      userId: req.user.id,
      refundMode,
    })

    res.json({
      success: true,
      data: result,
      message: 'Event cancelled successfully',
    })
  } catch (error) {
    next(error)
  }
}

async function handleGenerateZoomLink(req, res, next) {
  try {
    const payload = parseSchema(zoomLinkSchema, req.body || {})
    const zoom = await generateZoomMeetingLink(payload)

    res.json({
      success: true,
      data: { zoom },
      message: zoom.generated ? 'Zoom meeting link generated' : 'Zoom fallback link returned',
    })
  } catch (error) {
    next(error)
  }
}

async function handleSearchLocations(req, res, next) {
  try {
    const { q, limit } = parseSchema(searchLocationSchema, req.query)
    const locations = await searchLocations({ query: q, limit: limit || 5 })

    res.json({
      success: true,
      data: { locations },
    })
  } catch (error) {
    next(error)
  }
}

async function handleUploadEventPhoto(req, res, next) {
  try {
    const photo = await uploadEventPhoto({
      file: req.file,
      userId: req.user.id,
    })

    res.status(201).json({
      success: true,
      data: { photo },
      message: 'Event photo uploaded successfully',
    })
  } catch (error) {
    next(error)
  }
}

async function handleRegisterForEvent(req, res, next) {
  try {
    const payload = parseSchema(registerForEventSchema, req.body || {})
    const result = await registerForEvent({
      shortId: req.params.shortId,
      payload,
      viewerUser: req.user || null,
    })

    res.status(201).json({
      success: true,
      data: result,
      message: result.alreadyRegistered ? 'Already registered for this event' : 'OTP sent to your email',
    })
  } catch (error) {
    next(error)
  }
}

async function handleApproveRegistration(req, res, next) {
  try {
    const { registrationId } = parseSchema(approveRegistrationParamsSchema, req.params)
    const registration = await approveRegistrationById({
      registrationId,
      userId: req.user.id,
    })

    res.json({
      success: true,
      data: { registration },
      message: 'Registration approved',
    })
  } catch (error) {
    next(error)
  }
}

async function handleRejectRegistration(req, res, next) {
  try {
    const { registrationId } = parseSchema(rejectRegistrationParamsSchema, req.params)
    const registration = await rejectRegistrationById({
      registrationId,
      userId: req.user.id,
    })

    res.json({
      success: true,
      data: { registration },
      message: 'Registration rejected',
    })
  } catch (error) {
    next(error)
  }
}

async function handleGetEventDashboard(req, res, next) {
  try {
    const query = parseSchema(dashboardQuerySchema, req.query || {})
    const guestFilters = {
      search: query.guestSearch || '',
      status: query.guestStatus || 'all',
      page: query.guestPage || 1,
      limit: query.guestLimit || 20,
      sortBy: query.guestSortBy || 'createdAt',
      sortOrder: query.guestSortOrder || 'desc',
    }

    if (query.format === 'csv') {
      const { csv, filename } = await exportEventGuestsCsvByShortId({
        shortId: req.params.shortId,
        userId: req.user.id,
        guestFilters,
      })

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      return res.status(200).send(csv)
    }

    const dashboard = await getEventDashboardByShortId({
      shortId: req.params.shortId,
      userId: req.user.id,
      guestFilters,
      blastFilters: {
        page: query.blastPage || 1,
        limit: query.blastLimit || 20,
      },
    })

    return res.json({
      success: true,
      data: { dashboard },
    })
  } catch (error) {
    return next(error)
  }
}

async function handleGetEventHosts(req, res, next) {
  try {
    const result = await listEventHostsByShortId({
      shortId: req.params.shortId,
      userId: req.user.id,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

async function handleAddEventHost(req, res, next) {
  try {
    const payload = parseSchema(hostMutationSchema, req.body || {})
    const result = await addEventHostByShortId({
      shortId: req.params.shortId,
      actorUserId: req.user.id,
      userId: payload.userId || null,
      email: payload.email || null,
    })

    res.status(201).json({
      success: true,
      data: result,
      message: 'Host added successfully',
    })
  } catch (error) {
    next(error)
  }
}

async function handleRemoveEventHost(req, res, next) {
  try {
    const payload = parseSchema(hostMutationSchema, req.body || {})
    const result = await removeEventHostByShortId({
      shortId: req.params.shortId,
      actorUserId: req.user.id,
      userId: payload.userId || null,
      email: payload.email || null,
    })

    res.json({
      success: true,
      data: result,
      message: 'Host removed successfully',
    })
  } catch (error) {
    next(error)
  }
}

async function handleInviteGuests(req, res, next) {
  try {
    const payload = parseSchema(inviteGuestsSchema, req.body || {})
    const result = await inviteGuestsByShortId({
      shortId: req.params.shortId,
      userId: req.user.id,
      recipientEmails: payload.recipientEmails,
      subject: payload.subject || null,
      message: payload.message || null,
    })

    res.status(201).json({
      success: true,
      data: result,
      message: 'Invitations processed',
    })
  } catch (error) {
    next(error)
  }
}

async function handleGetEventBlast(req, res, next) {
  try {
    const query = parseSchema(blastQuerySchema, req.query || {})
    const result = await getEventBlastByShortId({
      shortId: req.params.shortId,
      userId: req.user.id,
      page: query.page || 1,
      limit: query.limit || 20,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

async function handleCreateEventBlast(req, res, next) {
  try {
    const payload = parseSchema(createBlastSchema, req.body || {})
    const result = await sendEventBlastByShortId({
      shortId: req.params.shortId,
      userId: req.user.id,
      subject: payload.subject,
      content: payload.content,
      recipients: payload.recipients,
    })

    res.status(201).json({
      success: true,
      data: result,
      message: 'Blast sent',
    })
  } catch (error) {
    next(error)
  }
}

export {
  handleCreateEvent,
  handleListEvents,
  handleGetEventByShortId,
  handleUpdateEvent,
  handleDeleteEvent,
  handleGenerateZoomLink,
  handleSearchLocations,
  handleUploadEventPhoto,
  handleRegisterForEvent,
  handleApproveRegistration,
  handleRejectRegistration,
  handleGetEventDashboard,
  handleGetEventHosts,
  handleAddEventHost,
  handleRemoveEventHost,
  handleInviteGuests,
  handleGetEventBlast,
  handleCreateEventBlast,
}
