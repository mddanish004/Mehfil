const DB_NAME = 'mehfil-checkin-db'
const DB_VERSION = 1
const STORE_NAME = 'checkin_queue'

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      store.createIndex('eventShortId', 'eventShortId', { unique: false })
      store.createIndex('dedupeKey', 'dedupeKey', { unique: true })
      store.createIndex('createdAt', 'createdAt', { unique: false })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB failed to open'))
  })
}

function runTransaction(mode, executor) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode)
        const store = transaction.objectStore(STORE_NAME)
        executor(store, resolve, reject)
        transaction.oncomplete = () => db.close()
        transaction.onerror = () => {
          db.close()
          reject(transaction.error || new Error('IndexedDB transaction failed'))
        }
      })
  )
}

function createDedupeKey(entry) {
  if (entry.type === 'manual') {
    return `manual:${entry.eventShortId}:${entry.registrationId}`
  }
  return `qr:${entry.eventShortId}:${entry.qrCode}`
}

async function enqueueOfflineCheckin(entry) {
  const payload = {
    id: createId(),
    type: entry.type === 'manual' ? 'manual' : 'qr',
    eventShortId: String(entry.eventShortId || '').trim(),
    registrationId: entry.registrationId ? String(entry.registrationId).trim() : null,
    qrCode: entry.qrCode ? String(entry.qrCode).trim() : null,
    createdAt: Date.now(),
  }
  payload.dedupeKey = createDedupeKey(payload)

  return runTransaction('readwrite', (store, resolve) => {
    const request = store.add(payload)
    request.onsuccess = () => resolve(payload)
    request.onerror = () => {
      resolve(null)
    }
  })
}

async function listOfflineCheckins(eventShortId) {
  return runTransaction('readonly', (store, resolve, reject) => {
    const eventIndex = store.index('eventShortId')
    const request = eventIndex.getAll(IDBKeyRange.only(eventShortId))
    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result : []
      rows.sort((a, b) => a.createdAt - b.createdAt)
      resolve(rows)
    }
    request.onerror = () => reject(request.error || new Error('Unable to read offline queue'))
  })
}

async function removeOfflineCheckin(id) {
  return runTransaction('readwrite', (store, resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(request.error || new Error('Unable to delete offline check-in'))
  })
}

async function countOfflineCheckins(eventShortId) {
  return runTransaction('readonly', (store, resolve, reject) => {
    const eventIndex = store.index('eventShortId')
    const request = eventIndex.count(IDBKeyRange.only(eventShortId))
    request.onsuccess = () => resolve(Number(request.result || 0))
    request.onerror = () => reject(request.error || new Error('Unable to count offline check-ins'))
  })
}

export {
  enqueueOfflineCheckin,
  listOfflineCheckins,
  removeOfflineCheckin,
  countOfflineCheckins,
}
