import api from '@/lib/api'

async function getEvents(params = {}) {
  const { data } = await api.get('/events', { params })
  return data.data
}

async function createEvent(payload) {
  const { data } = await api.post('/events', payload)
  return data.data
}

async function getEventByShortId(shortId) {
  const { data } = await api.get(`/events/${shortId}`)
  return data.data.event
}

async function updateEvent(shortId, payload) {
  const { data } = await api.put(`/events/${shortId}`, payload)
  return data.data
}

async function cancelEvent(shortId, payload = {}) {
  const { data } = await api.delete(`/events/${shortId}`, { data: payload })
  return data.data.event
}

async function registerForEvent(shortId, payload) {
  const { data } = await api.post(`/events/${shortId}/register`, payload)
  return data.data
}

async function generateZoomLink(payload = {}) {
  const { data } = await api.post('/events/zoom-link', payload)
  return data.data.zoom
}

async function searchOsmLocations(query, limit = 5) {
  const { data } = await api.get('/events/location/search', {
    params: {
      q: query,
      limit,
    },
  })

  return data.data.locations || []
}

async function uploadEventPhoto(file) {
  const formData = new FormData()
  formData.append('image', file)

  const { data } = await api.post('/events/upload-photo', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return data.data.photo
}

async function approveRegistration(registrationId) {
  const { data } = await api.put(`/events/registrations/${registrationId}/approve`)
  return data.data.registration
}

async function rejectRegistration(registrationId) {
  const { data } = await api.put(`/events/registrations/${registrationId}/reject`)
  return data.data.registration
}

async function getEventDashboard(shortId, params = {}) {
  const { data } = await api.get(`/events/${shortId}/dashboard`, { params })
  return data.data.dashboard
}

async function exportEventGuestsCsv(shortId, params = {}) {
  const { data } = await api.get(`/events/${shortId}/dashboard`, {
    params: {
      ...params,
      format: 'csv',
    },
    responseType: 'blob',
  })
  return data
}

async function getEventHosts(shortId) {
  const { data } = await api.get(`/events/${shortId}/hosts`)
  return data.data
}

async function addEventHost(shortId, payload) {
  const { data } = await api.post(`/events/${shortId}/hosts`, payload)
  return data.data
}

async function removeEventHost(shortId, payload) {
  const { data } = await api.delete(`/events/${shortId}/hosts`, { data: payload })
  return data.data
}

async function inviteEventGuests(shortId, payload) {
  const { data } = await api.post(`/events/${shortId}/invite`, payload)
  return data.data
}

async function getEventBlast(shortId, params = {}) {
  const { data } = await api.get(`/events/${shortId}/blast`, { params })
  return data.data
}

async function sendEventBlast(shortId, payload) {
  const { data } = await api.post(`/events/${shortId}/blast`, payload)
  return data.data
}

function parseStreamMessage(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function subscribeToEventCheckinStream(
  shortId,
  { onConnected = null, onCheckin = null, onError = null } = {}
) {
  const eventSource = new EventSource(`/api/events/${shortId}/checkin-stream`, {
    withCredentials: true,
  })

  if (typeof onConnected === 'function') {
    eventSource.addEventListener('connected', (event) => {
      onConnected(parseStreamMessage(event.data))
    })
  }

  if (typeof onCheckin === 'function') {
    eventSource.addEventListener('checkin', (event) => {
      const payload = parseStreamMessage(event.data)
      if (payload) {
        onCheckin(payload)
      }
    })
  }

  if (typeof onError === 'function') {
    eventSource.onerror = onError
  }

  return () => {
    eventSource.close()
  }
}

export {
  getEvents,
  createEvent,
  getEventByShortId,
  updateEvent,
  cancelEvent,
  registerForEvent,
  generateZoomLink,
  searchOsmLocations,
  uploadEventPhoto,
  approveRegistration,
  rejectRegistration,
  getEventDashboard,
  exportEventGuestsCsv,
  getEventHosts,
  addEventHost,
  removeEventHost,
  inviteEventGuests,
  getEventBlast,
  sendEventBlast,
  subscribeToEventCheckinStream,
}
