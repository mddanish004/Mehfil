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

async function cancelEvent(shortId) {
  const { data } = await api.delete(`/events/${shortId}`)
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
}
