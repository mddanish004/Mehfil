import env from '../config/env.js'

const ZOOM_OAUTH_URL = 'https://zoom.us/oauth/token'
const ZOOM_API_BASE_URL = 'https://api.zoom.us/v2'

function hasZoomConfig() {
  return Boolean(env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET)
}

function buildFallbackResponse(note, diagnostics = null) {
  return {
    link: 'https://zoom.us/meeting/schedule',
    generated: false,
    provider: 'fallback',
    note,
    ...(diagnostics ? { diagnostics } : {}),
  }
}

function toDurationMinutes(startDate, endDate) {
  const ms = endDate.getTime() - startDate.getTime()
  const minutes = Math.round(ms / 60000)
  return Math.max(15, minutes || 60)
}

function parseJsonSafely(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function requestZoomAccessToken() {
  const credentials = Buffer.from(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`).toString('base64')
  const tokenUrl = new URL(ZOOM_OAUTH_URL)
  tokenUrl.searchParams.set('grant_type', 'account_credentials')
  tokenUrl.searchParams.set('account_id', env.ZOOM_ACCOUNT_ID)

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  })

  const text = await response.text()
  const data = parseJsonSafely(text)

  if (!response.ok) {
    const err = new Error(data?.reason || data?.message || text || 'Failed to fetch Zoom access token')
    err.statusCode = response.status
    throw err
  }

  if (!data?.access_token) {
    const err = new Error('Zoom access token missing in OAuth response')
    err.statusCode = 502
    throw err
  }

  return data.access_token
}

async function createZoomMeeting({
  topic,
  agenda,
  startDatetime,
  endDatetime,
  timezone,
}) {
  const accessToken = await requestZoomAccessToken()
  const now = Date.now()
  const start = startDatetime ? new Date(startDatetime) : new Date(now + 15 * 60 * 1000)
  const end = endDatetime ? new Date(endDatetime) : new Date(start.getTime() + 60 * 60 * 1000)

  const response = await fetch(
    `${ZOOM_API_BASE_URL}/users/${encodeURIComponent(env.ZOOM_USER_ID)}/meetings`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: topic || 'Mehfil Virtual Event',
        agenda: agenda || '',
        type: 2,
        start_time: start.toISOString(),
        duration: toDurationMinutes(start, end),
        timezone: timezone || 'UTC',
        settings: {
          join_before_host: false,
          waiting_room: true,
          host_video: true,
          participant_video: true,
          mute_upon_entry: true,
          approval_type: 2,
          registration_type: 1,
        },
      }),
    }
  )

  const text = await response.text()
  const data = parseJsonSafely(text)

  if (!response.ok) {
    const err = new Error(data?.message || text || 'Failed to create Zoom meeting')
    err.statusCode = response.status
    throw err
  }

  const joinUrl = data?.join_url

  if (!joinUrl) {
    const err = new Error('Zoom meeting created without a join URL')
    err.statusCode = 502
    throw err
  }

  return {
    link: joinUrl,
    meetingId: data?.id || null,
    password: data?.password || null,
  }
}

async function generateZoomMeetingLink(options = {}) {
  if (!hasZoomConfig()) {
    return buildFallbackResponse(
      'Zoom credentials are missing. Add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET.'
    )
  }

  try {
    const meeting = await createZoomMeeting(options)
    return {
      link: meeting.link,
      generated: true,
      provider: 'zoom',
      meetingId: meeting.meetingId,
      password: meeting.password,
    }
  } catch (error) {
    return buildFallbackResponse(
      'Automatic Zoom meeting creation is unavailable. Check Zoom app credentials and account permissions.',
      { zoomApi: error.message }
    )
  }
}

export { generateZoomMeetingLink }
