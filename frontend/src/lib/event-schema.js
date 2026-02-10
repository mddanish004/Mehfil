import { z } from 'zod'

function toLocalDatetimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

const eventFormSchema = z
  .object({
    name: z.string().trim().min(3, 'Event name must be at least 3 characters').max(100),
    description: z.string().max(10000, 'Description cannot exceed 10,000 characters').default(''),
    photoUrl: z.string().url('Photo URL must be valid').or(z.literal('')).default(''),
    startDatetime: z.string().min(1, 'Start date/time is required'),
    endDatetime: z.string().min(1, 'End date/time is required'),
    timezone: z.string().trim().min(1, 'Timezone is required').max(100),
    locationType: z.enum(['physical', 'virtual']),
    locationAddress: z.string().max(500).optional().nullable(),
    locationLat: z.number().min(-90).max(90).optional().nullable(),
    locationLng: z.number().min(-180).max(180).optional().nullable(),
    zoomMeetingLink: z.string().url('Zoom meeting link must be valid').or(z.literal('')).default(''),
    isPaid: z.boolean().default(false),
    ticketPrice: z.coerce.number().min(0).default(0),
    requireApproval: z.boolean().default(false),
    capacityType: z.enum(['unlimited', 'limited']).default('unlimited'),
    capacityLimit: z.coerce.number().int().min(1).max(100000).optional().nullable(),
    status: z.enum(['draft', 'published', 'cancelled']).default('draft'),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.startDatetime)
    const end = new Date(data.endDatetime)

    if (Number.isNaN(start.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startDatetime'],
        message: 'Start date/time is invalid',
      })
    }

    if (Number.isNaN(end.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDatetime'],
        message: 'End date/time is invalid',
      })
    }

    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDatetime'],
        message: 'End date/time must be after start date/time',
      })
    }

    if (data.locationType === 'physical' && !data.locationAddress?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['locationAddress'],
        message: 'Location address is required for physical events',
      })
    }

    if (data.isPaid && data.ticketPrice <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ticketPrice'],
        message: 'Paid events must have a ticket price greater than 0',
      })
    }

    if (data.capacityType === 'limited' && !data.capacityLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capacityLimit'],
        message: 'Capacity limit is required for limited events',
      })
    }
  })

function getDefaultEventFormValues() {
  return {
    name: '',
    description: '',
    photoUrl: '',
    startDatetime: '',
    endDatetime: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    locationType: 'physical',
    locationAddress: '',
    locationLat: null,
    locationLng: null,
    zoomMeetingLink: '',
    isPaid: false,
    ticketPrice: 0,
    requireApproval: false,
    capacityType: 'unlimited',
    capacityLimit: null,
    status: 'draft',
  }
}

function toEventFormValues(event) {
  return {
    name: event.name || '',
    description: event.description || '',
    photoUrl: event.photoUrl || '',
    startDatetime: toLocalDatetimeInput(event.startDatetime),
    endDatetime: toLocalDatetimeInput(event.endDatetime),
    timezone: event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    locationType: event.locationType || 'physical',
    locationAddress: event.locationAddress || '',
    locationLat: typeof event.locationLat === 'number' ? event.locationLat : null,
    locationLng: typeof event.locationLng === 'number' ? event.locationLng : null,
    zoomMeetingLink: event.zoomMeetingLink || '',
    isPaid: Boolean(event.isPaid),
    ticketPrice: Number(event.ticketPrice || 0),
    requireApproval: Boolean(event.requireApproval),
    capacityType: event.capacityType || 'unlimited',
    capacityLimit: event.capacityLimit || null,
    status: event.status || 'draft',
  }
}

export { eventFormSchema, getDefaultEventFormValues, toEventFormValues }
