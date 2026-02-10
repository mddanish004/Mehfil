import { randomUUID } from 'crypto'

const checkinStreams = new Map()

function writeEvent(res, event, payload) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function removeClient(eventId, clientId) {
  const eventStreams = checkinStreams.get(eventId)
  if (!eventStreams) {
    return
  }

  eventStreams.delete(clientId)
  if (!eventStreams.size) {
    checkinStreams.delete(eventId)
  }
}

function subscribeToCheckinStream({ eventId, res }) {
  const clientId = randomUUID()
  const eventStreams = checkinStreams.get(eventId) || new Map()
  eventStreams.set(clientId, res)
  checkinStreams.set(eventId, eventStreams)

  writeEvent(res, 'connected', {
    connectedAt: new Date().toISOString(),
  })

  return () => {
    removeClient(eventId, clientId)
  }
}

function publishCheckinUpdate({ eventId, payload }) {
  const eventStreams = checkinStreams.get(eventId)
  if (!eventStreams?.size) {
    return
  }

  const staleClients = []

  for (const [clientId, res] of eventStreams.entries()) {
    try {
      writeEvent(res, 'checkin', payload)
    } catch {
      staleClients.push(clientId)
    }
  }

  staleClients.forEach((clientId) => removeClient(eventId, clientId))
}

const heartbeatInterval = setInterval(() => {
  const now = new Date().toISOString()
  for (const [eventId, eventStreams] of checkinStreams.entries()) {
    const staleClients = []
    for (const [clientId, res] of eventStreams.entries()) {
      try {
        writeEvent(res, 'ping', { now })
      } catch {
        staleClients.push(clientId)
      }
    }
    staleClients.forEach((clientId) => removeClient(eventId, clientId))
  }
}, 25000)

if (typeof heartbeatInterval.unref === 'function') {
  heartbeatInterval.unref()
}

export { subscribeToCheckinStream, publishCheckinUpdate }
