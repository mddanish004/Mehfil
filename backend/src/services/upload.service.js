import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import env from '../config/env.js'
import supabase, { supabaseService } from '../config/supabase.js'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function getStorageClient() {
  const client = supabaseService || supabase

  if (!client) {
    const err = new Error('Supabase client is not configured')
    err.statusCode = 500
    throw err
  }

  return client
}

function validateImageFile(file) {
  if (!file) {
    const err = new Error('Image file is required')
    err.statusCode = 400
    throw err
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    const err = new Error('Invalid image type. Allowed: JPG, PNG, WebP')
    err.statusCode = 400
    throw err
  }

  if (file.size > MAX_IMAGE_SIZE) {
    const err = new Error('Image exceeds 5MB size limit')
    err.statusCode = 400
    throw err
  }
}

async function optimizeImage(buffer) {
  const pipeline = sharp(buffer).rotate().resize({
    width: 1600,
    height: 1600,
    fit: 'inside',
    withoutEnlargement: true,
  })

  const metadata = await pipeline.metadata()
  const optimizedBuffer = await pipeline.webp({ quality: 82, effort: 4 }).toBuffer()

  return {
    optimizedBuffer,
    width: metadata.width || null,
    height: metadata.height || null,
  }
}

async function uploadEventPhoto({ file, userId }) {
  validateImageFile(file)

  const { optimizedBuffer, width, height } = await optimizeImage(file.buffer)
  const client = getStorageClient()

  const bucket = env.SUPABASE_EVENT_IMAGES_BUCKET
  const filePath = `${userId}/${Date.now()}-${uuidv4()}.webp`

  const { error: uploadError } = await client.storage.from(bucket).upload(filePath, optimizedBuffer, {
    contentType: 'image/webp',
    cacheControl: '3600',
    upsert: false,
  })

  if (uploadError) {
    const err = new Error(`Failed to upload image: ${uploadError.message}`)
    err.statusCode = 500
    throw err
  }

  const { data } = client.storage.from(bucket).getPublicUrl(filePath)

  return {
    url: data.publicUrl,
    path: filePath,
    width,
    height,
    size: optimizedBuffer.length,
    mimeType: 'image/webp',
  }
}

export { uploadEventPhoto }
