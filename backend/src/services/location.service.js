import env from '../config/env.js'

function parseJsonSafely(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function clampLimit(limit) {
  return Math.min(Math.max(limit, 1), 10)
}

function buildNominatimUrl(query, limit) {
  const url = new URL('/search', env.OSM_NOMINATIM_BASE_URL)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('q', query)

  if (env.OSM_CONTACT_EMAIL) {
    url.searchParams.set('email', env.OSM_CONTACT_EMAIL)
  }

  return url
}

function mapNominatimResult(item) {
  return {
    displayName: item.display_name || '',
    lat: Number(item.lat),
    lng: Number(item.lon),
    osmType: item.osm_type || null,
    osmId: item.osm_id || null,
  }
}

async function searchNominatim(query, limit) {
  const url = buildNominatimUrl(query, limit)
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': env.OSM_USER_AGENT,
      Accept: 'application/json',
    },
  })

  const text = await response.text()
  const data = parseJsonSafely(text)

  if (!response.ok) {
    const err = new Error(`Nominatim request failed with status ${response.status}`)
    err.statusCode = response.status
    err.details = data || text
    throw err
  }

  if (!Array.isArray(data)) {
    return []
  }

  return data.map(mapNominatimResult)
}

async function searchPhoton(query, limit) {
  const url = new URL('/api', env.OSM_PHOTON_BASE_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  const text = await response.text()
  const data = parseJsonSafely(text)

  if (!response.ok) {
    const err = new Error(`Photon request failed with status ${response.status}`)
    err.statusCode = response.status
    err.details = data || text
    throw err
  }

  const features = Array.isArray(data?.features) ? data.features : []

  return features
    .map((feature) => {
      const coordinates = feature?.geometry?.coordinates
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return null
      }

      const [lng, lat] = coordinates
      const properties = feature?.properties || {}
      const displayName =
        properties.name ||
        [properties.street, properties.city, properties.country].filter(Boolean).join(', ') ||
        'Selected location'

      return {
        displayName,
        lat: Number(lat),
        lng: Number(lng),
        osmType: properties.osm_type || null,
        osmId: properties.osm_id || null,
      }
    })
    .filter(Boolean)
}

async function searchLocations({ query, limit = 5 }) {
  const normalizedQuery = (query || '').trim()
  if (normalizedQuery.length < 2) {
    return []
  }

  const safeLimit = clampLimit(limit)

  try {
    return await searchNominatim(normalizedQuery, safeLimit)
  } catch (nominatimError) {
    try {
      return await searchPhoton(normalizedQuery, safeLimit)
    } catch (photonError) {
      const err = new Error('OpenStreetMap location lookup failed')
      err.statusCode = 502
      err.details = {
        nominatim: nominatimError.message,
        photon: photonError.message,
      }
      throw err
    }
  }
}

export { searchLocations }
