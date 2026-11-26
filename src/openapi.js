import { z } from 'zod'
import * as input from './validation.js'

const ref = name => ({ $ref: '#/components/schemas/' + name })
const object = properties => ({ type: 'object', required: Object.keys(properties), properties })
const integer = { type: 'integer' }
const string = { type: 'string' }
const timestamp = { type: 'string', format: 'date-time' }
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] })
const list = items => ({ type: 'array', items })
const json = (schema, example) => ({ 'application/json': { schema, ...(example && { example }) } })
const positiveId = { ...integer, minimum: 1, maximum: 2147483647 }
const id = { name: 'id', in: 'path', required: true, schema: positiveId }

const user = { id: 1, name: 'Taylor', email: 'taylor@example.test', role: 'User', created_at: '2026-01-01T00:00:00Z' }
const project = { id: 1, name: 'Website', description: null, created_by: 1, created_at: user.created_at }
const task = { id: 1, title: 'Backend draft', description: null, project_id: 1, assigned_to: 1,
  status: 'Pending', priority: 'High', due_date: '2027-01-15', created_at: user.created_at, updated_at: user.created_at }
const stats = { totalProjects: 1, totalTasks: 1, pendingTasks: 1, inProgressTasks: 0, completedTasks: 0, assignedToMe: 1 }
const page = { total: 1, page: 1, limit: 10, totalPages: 1 }
const authExample = { email: user.email, password: 'example-password' }
const enums = {
  status: { type: 'string', enum: ['Pending', 'In Progress', 'Completed'] },
  priority: { type: 'string', enum: ['Low', 'Medium', 'High'] }
}
const filters = {
  search: { type: 'string', description: 'Case-insensitive literal substring in the task title', example: 'backend', minLength: 1, maxLength: 200 },
  ...enums, assigned_to: positiveId, project_id: positiveId,
  page: { ...positiveId, default: 1 }, limit: { ...integer, minimum: 1, maximum: 100, default: 10 }
}
const errors = {
  400: 'Invalid input or reference', 401: 'Missing, invalid or expired credentials',
  403: 'Insufficient permission for this action', 404: 'Resource missing or outside your access',
  409: 'Duplicate resource', 413: 'Request body too large', 415: 'Unsupported encoding',
  429: 'Authentication rate limit reached', 500: 'Internal server error'
}

function operation({ summary, description, tag, schema, example, message, status = 200,
  body, parameters, publicRoute = false, errors: codes = [], paginated = false }) {
  const response = object({ success: { const: true }, message: string, data: schema,
    ...(paginated && { pagination: ref('Pagination') }) })
  const responseExample = { success: true, message, data: example, ...(paginated && { pagination: page }) }
  const errorCodes = new Set([...codes, ...(body ? [400, 413, 415] : []), ...(publicRoute ? [429] : [401, 403]), 500])
  return {
    summary, tags: [tag],
    ...(description && { description }),
    ...(publicRoute && { security: [] }),
    ...(parameters && { parameters }),
    ...(body && { requestBody: { required: true, content: json(ref(body[0]), body[1]) } }),
    responses: {
      [status]: { description: message, content: json(response, responseExample) },
      ...Object.fromEntries([...errorCodes].map(code => [code, {
        description: errors[code], content: json(ref('Error'), { success: false, message: errors[code] })
      }]))
    }
  }
}

const auth = options => operation({ tag: 'Authentication', publicRoute: true, ...options })
const projects = options => operation({ tag: 'Projects', ...options })
const tasks = options => operation({ tag: 'Tasks', ...options })
const projectAccess = 'Admins, the creator and users with a task assigned in this project can view it.'
const managerAccess = 'Admins and the project creator may perform this operation.'
const taskAccess = 'Admins, the project creator and the task assignee can view this task.'
const pathOptions = { parameters: [id], errors: [400, 404] }
const taskExample = { title: task.title, project_id: 1, assigned_to: 1, priority: 'High', due_date: task.due_date }

export const openapi = {
  openapi: '3.1.0',
  info: { title: 'Task Management & Team Collaboration API', version: '1.0.0' },
  servers: [{ url: '/' }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      ...Object.fromEntries(Object.entries({
        Register: input.registration, Login: input.login, ProjectCreate: input.projectCreate,
        ProjectUpdate: input.projectUpdate, TaskCreate: input.taskCreate, TaskUpdate: input.taskUpdate
      }).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })])),
      User: object({ id: integer, name: string, email: string, role: { enum: ['Admin', 'User'] }, created_at: timestamp }),
      Project: object({ id: integer, name: string, description: nullable(string), created_by: integer, created_at: timestamp }),
      Task: object({ id: integer, title: string, description: nullable(string), project_id: integer,
        assigned_to: nullable(integer), ...enums, due_date: { type: 'string', format: 'date' }, created_at: timestamp, updated_at: timestamp }),
      Stats: object(Object.fromEntries(Object.keys(stats).map(key => [key, integer]))),
      Pagination: object(Object.fromEntries(Object.keys(page).map(key => [key, integer]))),
      Deleted: object({ id: integer }),
      Error: object({ success: { const: false }, message: string })
    }
  },
  paths: {
    '/api/auth/register': { post: auth({ summary: 'Register a User', description: 'Public registration creates the User role.',
      body: ['Register', { name: user.name, ...authExample }], status: 201, message: 'User registered',
      schema: ref('User'), example: user, errors: [409] }) },
    '/api/auth/login': { post: auth({ summary: 'Log in', body: ['Login', authExample], message: 'Login successful',
      schema: object({ accessToken: string, user: ref('User') }),
      example: { accessToken: '<JWT>', user }, errors: [401] }) },
    '/api/projects': {
      get: projects({ summary: 'List visible projects', description: projectAccess,
        schema: list(ref('Project')), example: [project], message: 'Projects retrieved' }),
      post: projects({ summary: 'Create a project', description: 'Any authenticated account can create a project.',
        body: ['ProjectCreate', { name: project.name }], status: 201, schema: ref('Project'), example: project, message: 'Project created' })
    },
    '/api/projects/{id}': {
      get: projects({ ...pathOptions, summary: 'Read a project', description: projectAccess,
        schema: ref('Project'), example: project, message: 'Project retrieved' }),
      put: projects({ ...pathOptions, summary: 'Update supplied project fields', description: managerAccess + ' Supply at least one field.',
        body: ['ProjectUpdate', { name: 'Website launch' }], schema: ref('Project'),
        example: { ...project, name: 'Website launch' }, message: 'Project updated' }),
      delete: projects({ ...pathOptions, summary: 'Delete a project and its tasks', description: managerAccess,
        schema: ref('Deleted'), example: { id: 1 }, message: 'Project deleted' })
    },
    '/api/tasks': {
      get: tasks({ summary: 'Search and list visible tasks', description: taskAccess + ' Filters combine with AND. Results are newest ID first.',
        parameters: Object.entries(filters).map(([name, schema]) => ({ name, in: 'query', schema })),
        paginated: true, schema: list(ref('Task')), example: [task], message: 'Tasks retrieved', errors: [400] }),
      post: tasks({ summary: 'Create a task', description: managerAccess + ' The assignment is optional and due_date is required.',
        body: ['TaskCreate', taskExample], status: 201, schema: ref('Task'), example: task, message: 'Task created', errors: [404] })
    },
    '/api/tasks/{id}': {
      get: tasks({ ...pathOptions, summary: 'Read a task', description: taskAccess,
        schema: ref('Task'), example: task, message: 'Task retrieved' }),
      put: tasks({ ...pathOptions, summary: 'Update supplied task fields', description: 'Admins and creators may update any documented field. Assignees may update status only. Supply at least one field.',
        body: ['TaskUpdate', { status: 'Completed' }], schema: ref('Task'),
        example: { ...task, status: 'Completed' }, message: 'Task updated' }),
      delete: tasks({ ...pathOptions, summary: 'Delete a task', description: managerAccess,
        schema: ref('Deleted'), example: { id: 1 }, message: 'Task deleted' })
    },
    '/api/dashboard/stats': { get: operation({ tag: 'Dashboard', summary: 'Read dashboard statistics',
      description: 'Admins receive global totals. Other users receive totals for their visible resources. assignedToMe is personal for every role.',
      schema: ref('Stats'), example: stats, message: 'Dashboard statistics retrieved' }) }
  }
}
