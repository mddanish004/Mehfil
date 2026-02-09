import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import env from './env.js'
import * as schema from '../models/schema.js'

const connectionString = env.DATABASE_URL

if (!connectionString) {
  console.warn('DATABASE_URL is not set. Database operations will fail.')
}

const client = connectionString
  ? postgres(connectionString, {
      prepare: false,
    })
  : null

const db = client ? drizzle(client, { schema }) : null

export { db, client }
