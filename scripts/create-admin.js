import { createPool, readConfig } from '../src/config.js'
import { createUser } from '../src/auth.js'
import { registration } from '../src/validation.js'
import { HttpError } from '../src/http.js'

try {
  const input = registration.safeParse({
    name: process.env.ADMIN_NAME, email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD
  })
  if (!input.success) throw new Error('Set valid ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD')
  const pool = createPool(readConfig())
  try {
    const admin = await createUser(pool, input.data, 'Admin')
    console.log('Admin created with ID', admin.id)
  } finally {
    await pool.end()
  }
} catch (error) {
  console.error(error instanceof HttpError || !error.code ? error.message : 'Admin creation failed')
  process.exitCode = 1
}
