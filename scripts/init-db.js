import { readFile } from 'node:fs/promises'

export async function initializeDatabase(pool) {
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(829103)')
    await client.query(schema)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
