import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config()

function getMigrationFolder() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(__dirname, '../../drizzle/migrations')
}

function readJournal(migrationsFolder) {
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json')
  const journalRaw = fs.readFileSync(journalPath, 'utf8')
  const journal = JSON.parse(journalRaw)
  return Array.isArray(journal.entries) ? journal.entries : []
}

function readMigrationHash(migrationsFolder, tag) {
  const sqlPath = path.join(migrationsFolder, `${tag}.sql`)
  const sql = fs.readFileSync(sqlPath, 'utf8')
  return crypto.createHash('sha256').update(sql).digest('hex')
}

async function hasTable(sql, tableName) {
  const rows = await sql`
    select to_regclass(${`public.${tableName}`}) as regclass
  `
  return Boolean(rows?.[0]?.regclass)
}

async function hasType(sql, typeName) {
  const rows = await sql`
    select exists (
      select 1
      from pg_type t
      inner join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = ${typeName}
    ) as exists
  `
  return Boolean(rows?.[0]?.exists)
}

async function hasColumns(sql, tableName, columns) {
  const rows = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
      and column_name = any(${columns})
  `

  const present = new Set(rows.map((row) => row.column_name))
  return columns.every((column) => present.has(column))
}

async function detectAppliedMigrations(sql, entries) {
  const checks = {
    '0000_purple_zombie': async () => hasTable(sql, 'users'),
    '0001_rare_ink': async () =>
      (await hasTable(sql, 'password_reset_tokens')) &&
      (await hasTable(sql, 'refresh_tokens')),
    '0002_guest_registration': async () =>
      (await hasType(sql, 'verification_purpose')) &&
      (await hasColumns(sql, 'registrations', ['email_verified', 'email_verified_at'])) &&
      (await hasColumns(sql, 'email_verifications', [
        'purpose',
        'event_id',
        'registration_id',
      ])),
  }

  let highestAppliedIndex = -1

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const check = checks[entry.tag]
    if (!check) {
      break
    }

    const applied = await check()
    if (!applied) {
      break
    }

    highestAppliedIndex = index
  }

  return highestAppliedIndex
}

async function ensureMigrationsTable(sql) {
  await sql`create schema if not exists "drizzle"`
  await sql`
    create table if not exists "drizzle"."__drizzle_migrations" (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }

  const migrationsFolder = getMigrationFolder()
  const entries = readJournal(migrationsFolder)
  if (!entries.length) {
    return
  }

  const sql = postgres(databaseUrl)

  try {
    await ensureMigrationsTable(sql)

    const existingRows = await sql`select id from drizzle.__drizzle_migrations limit 1`
    if (existingRows.length) {
      return
    }

    const highestAppliedIndex = await detectAppliedMigrations(sql, entries)
    if (highestAppliedIndex < 0) {
      return
    }

    await sql.begin(async (transaction) => {
      for (let index = 0; index <= highestAppliedIndex; index += 1) {
        const entry = entries[index]
        const hash = readMigrationHash(migrationsFolder, entry.tag)
        await transaction`
          insert into drizzle.__drizzle_migrations (hash, created_at)
          values (${hash}, ${entry.when})
        `
      }
    })
  } finally {
    await sql.end()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
