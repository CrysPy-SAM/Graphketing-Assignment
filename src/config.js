import 'dotenv/config'
import pg from 'pg'
import { z } from 'zod'

const databaseUrl = z.url().refine(value => /^postgres(?:ql)?:\/\//.test(value))
const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: databaseUrl.optional(),
  PGHOST: z.string().min(1).optional(),
  PGUSER: z.string().min(1).optional(),
  PGDATABASE: z.string().min(1).optional(),
  PGPASSWORD: z.string().min(1).optional(),
  PGPORT: z.coerce.number().int().min(1).max(65535).default(5432),
  JWT_SECRET: z.string().min(32).refine(value => value !== 'replace_with_a_secure_random_secret'),
  JWT_EXPIRES_IN: z.string().regex(/^[1-9]\d{0,3}[smhd]$/).default('1d'),
  CORS_ORIGINS: z.string().default('').transform(value => value.split(',').map(origin => origin.trim()).filter(Boolean))
    .refine(origins => origins.every(origin => {
      try {
        const url = new URL(origin)
        return ['http:', 'https:'].includes(url.protocol) && url.origin === origin
      } catch {
        return false
      }
    }))
}).refine(env => env.DATABASE_URL || (env.PGHOST && env.PGUSER && env.PGDATABASE && env.PGPASSWORD), {
  path: ['DATABASE_URL'],
  message: 'Set DATABASE_URL or the PostgreSQL connection variables'
})

export function readConfig(source = process.env) {
  const result = configSchema.safeParse(source)
  if (!result.success) {
    throw new Error('Invalid configuration: ' + result.error.issues.map(issue => issue.path.join('.')).join(', '))
  }
  return result.data
}

export function createPool(config) {
  const connection = config.DATABASE_URL ? { connectionString: config.DATABASE_URL } : {
    host: config.PGHOST, port: config.PGPORT, user: config.PGUSER,
    database: config.PGDATABASE, password: config.PGPASSWORD
  }
  const pool = new pg.Pool({ ...connection, connectionTimeoutMillis: 5000 })
  pool.on('error', () => console.error('Idle PostgreSQL connection failed'))
  return pool
}
