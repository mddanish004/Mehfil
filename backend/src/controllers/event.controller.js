import { ZodError, z } from 'zod'
import { createEvent, getEventByShortId, updateEventByShortId, cancelEventByShortId } from '../services/event.service.js'
import { uploadEventPhoto } from '../services/upload.service.js'
import { generateZoomMeetingLink } from '../services/zoom.service.js'
import { searchLocations } from '../services/location.service.js'

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
    const event = await getEventByShortId(req.params.shortId)

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
    const event = await cancelEventByShortId({
      shortId: req.params.shortId,
      userId: req.user.id,
    })

    res.json({
      success: true,
      data: { event },
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

export {
  handleCreateEvent,
  handleGetEventByShortId,
  handleUpdateEvent,
  handleDeleteEvent,
  handleGenerateZoomLink,
  handleSearchLocations,
  handleUploadEventPhoto,
}
