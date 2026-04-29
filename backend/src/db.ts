import pg from 'pg'
import { readEnv } from './env.js'

const { Pool } = pg

export type Db = {
  pool: pg.Pool
}

export function createDb(): Db {
  const env = readEnv()
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
  })
  return { pool }
}
