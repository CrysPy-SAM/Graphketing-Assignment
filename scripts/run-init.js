import { createPool, readConfig } from '../src/config.js'
import { initializeDatabase } from './init-db.js'

try {
  const pool = createPool(readConfig())
  try {
    await initializeDatabase(pool)
    console.log('Database schema initialized.')
  } finally {
    await pool.end()
  }
} catch (error) {
  console.error('Database initialization failed.', error.code ?? (error.message.startsWith('Invalid configuration') ? error.message : error.name))
  process.exitCode = 1
}
