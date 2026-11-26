import { createApp } from './app.js'
import { createPool, readConfig } from './config.js'

try {
  const config = readConfig()
  const pool = createPool(config)
  try {
    await pool.query('SELECT 1 FROM users LIMIT 0')
    await pool.query('SELECT 1 FROM projects LIMIT 0')
    await pool.query('SELECT 1 FROM tasks LIMIT 0')
    const server = await new Promise((resolve, reject) => {
      const listener = createApp(pool, config).listen(config.PORT, () => resolve(listener))
      listener.once('error', reject)
    })
    console.log(`Task API listening on port ${config.PORT}`)
    function shutdown() {
      server.close(async () => { await pool.end() })
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  } catch (error) {
    await pool.end()
    throw error
  }
} catch (error) {
  console.error('API startup failed.', error.code ?? (error.message.startsWith('Invalid configuration') ? error.message : error.name))
  process.exitCode = 1
}
