import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { HttpError, success } from './http.js'

export async function createUser(pool, { name, email, password }, role = 'User') {
  const hash = await bcrypt.hash(password, 12)
  try {
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email, hash, role]
    )
    return result.rows[0]
  } catch (error) {
    if (error.code === '23505') throw new HttpError(409, 'Email is already registered')
    throw error
  }
}

export function authHandlers(pool, config) {
  // Compare against a bcrypt hash even when the email does not exist.
  let fallbackHash
  return {
    register: async (req, res) => {
      const user = await createUser(pool, req.validated.body)
      return success(res, 201, 'User registered', user)
    },
    login: async (req, res) => {
      const { email, password } = req.validated.body
      const { rows: [record] } = await pool.query(
        'SELECT id, name, email, role, created_at, password FROM users WHERE email = $1', [email]
      )
      if (!record) fallbackHash ??= bcrypt.hash('unused-login-placeholder', 12)
      const valid = await bcrypt.compare(password, record?.password ?? await fallbackHash)
      if (!record || !valid) throw new HttpError(401, 'Invalid email or password')
      const { id, name, role, created_at } = record
      const accessToken = jwt.sign({}, config.JWT_SECRET, {
        algorithm: 'HS256', subject: String(id), issuer: 'graphketing-task-api', expiresIn: config.JWT_EXPIRES_IN
      })
      res.set('Cache-Control', 'no-store')
      return success(res, 200, 'Login successful', {
        accessToken, user: { id, name, email: record.email, role, created_at }
      })
    }
  }
}

export function authenticate(pool, config) {
  return async (req, res, next) => {
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1]
    if (!token) throw new HttpError(401, 'Bearer token required')
    let payload
    try {
      payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer: 'graphketing-task-api' })
    } catch (error) {
      throw new HttpError(401, error.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token')
    }
    const id = Number(payload.sub)
    if (!Number.isInteger(id) || id < 1 || id > 2147483647 || payload.sub !== String(id)) {
      throw new HttpError(401, 'Invalid access token')
    }
    const { rows: [user] } = await pool.query('SELECT id, role FROM users WHERE id = $1', [id])
    if (!user) throw new HttpError(401, 'Invalid access token')
    req.user = user
    next()
  }
}

export const isAdmin = user => user.role === 'Admin'

export function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) throw new HttpError(403, 'Role is not permitted')
    next()
  }
}
