import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import { authHandlers, authenticate, authorizeRoles } from './auth.js'
import { projectHandlers } from './projects.js'
import { taskHandlers } from './tasks.js'
import { dashboardHandler } from './dashboard.js'
import { handleError, HttpError } from './http.js'
import * as input from './validation.js'
import { openapi } from './openapi.js'

export function createApp(pool, config) {
  const app = express()
  app.use(helmet())
  app.use(cors({ origin: config.CORS_ORIGINS }))
  app.use(express.json({ limit: '16kb' }))
  app.get('/api-docs.json', (req, res) => res.json(openapi))
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi))

  const api = express.Router()
  const auth = authHandlers(pool, config)
  const projects = projectHandlers(pool)
  const tasks = taskHandlers(pool)
  const body = schema => input.validate('body', schema)
  const id = input.validate('params', input.resourceId)
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res, next) => next(new HttpError(429, 'Too many authentication requests'))
  })
  api.post('/auth/register', authLimit, body(input.registration), auth.register)
  api.post('/auth/login', authLimit, body(input.login), auth.login)

  const protectedRoutes = express.Router()
  const protect = [authenticate(pool, config), authorizeRoles('Admin', 'User')]
  protectedRoutes.route('/projects').get(...protect, projects.list).post(...protect, body(input.projectCreate), projects.create)
  protectedRoutes.route('/projects/:id').get(...protect, id, projects.detail)
    .put(...protect, id, body(input.projectUpdate), projects.update).delete(...protect, id, projects.remove)
  protectedRoutes.route('/tasks').get(...protect, input.validate('query', input.taskQuery), tasks.list)
    .post(...protect, body(input.taskCreate), tasks.create)
  protectedRoutes.route('/tasks/:id').get(...protect, id, tasks.detail)
    .put(...protect, id, body(input.taskUpdate), tasks.update).delete(...protect, id, tasks.remove)
  protectedRoutes.get('/dashboard/stats', ...protect, dashboardHandler(pool))

  app.use('/api', api, protectedRoutes)
  app.use((req, res, next) => next(new HttpError(404, 'Route not found')))
  app.use(handleError)
  return app
}
