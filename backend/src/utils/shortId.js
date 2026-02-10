import slugify from 'slugify'
import { v4 as uuidv4 } from 'uuid'

const MAX_SHORT_ID_LENGTH = 20
const UUID_SEGMENT_LENGTH = 6
const DEFAULT_BASE = 'event'

function generateShortId(name = DEFAULT_BASE) {
  const slugBase =
    slugify(name, {
      lower: true,
      strict: true,
      trim: true,
    }) || DEFAULT_BASE

  const suffix = uuidv4().replace(/-/g, '').slice(0, UUID_SEGMENT_LENGTH)
  const maxBaseLength = MAX_SHORT_ID_LENGTH - suffix.length - 1
  const base = slugBase.slice(0, Math.max(1, maxBaseLength))

  return `${base}-${suffix}`
}

export { generateShortId, MAX_SHORT_ID_LENGTH }
