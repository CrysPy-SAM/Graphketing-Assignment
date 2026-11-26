import { randomBytes, randomUUID } from 'node:crypto'
import { jest } from '@jest/globals'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createPool, readConfig } from '../src/config.js'
import { createUser } from '../src/auth.js'
import { initializeDatabase } from '../scripts/init-db.js'

jest.setTimeout(20000)
const schema = 'assessment_' + randomUUID().replaceAll('-', '')
const password = randomBytes(18).toString('hex')
const credentials = name => ({ name, email: name.toLowerCase() + '@example.test', password })
const due_date = '2027-01-15'
let pool, maintenancePool, app, config, owner, assignee, outsider, admin

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL for a dedicated PostgreSQL test database')
  config = readConfig({
    DATABASE_URL: process.env.TEST_DATABASE_URL, JWT_SECRET: randomBytes(32).toString('hex'), NODE_ENV: 'test'
  })
  maintenancePool = createPool(config)
  await maintenancePool.query(`CREATE SCHEMA ${schema}`)
  const url = new URL(config.DATABASE_URL)
  url.searchParams.set('options', '-c search_path=' + schema)
  pool = createPool({ ...config, DATABASE_URL: url.toString() })
  await initializeDatabase(pool)
  await initializeDatabase(pool)
  app = createApp(pool, config)
  for (const name of ['Owner', 'Assignee', 'Outsider']) {
    await request(app).post('/api/auth/register').send(credentials(name)).expect(201)
  }
  await createUser(pool, credentials('Admin'), 'Admin')
  async function signIn(name) {
    const { email } = credentials(name)
    const { body } = await request(app).post('/api/auth/login').send({ email, password })
      .expect(200).expect('Cache-Control', 'no-store')
    return body.data
  }
  owner = await signIn('Owner')
  assignee = await signIn('Assignee')
  outsider = await signIn('Outsider')
  admin = await signIn('Admin')
})

afterAll(async () => {
  try {
    await pool?.end()
    await maintenancePool?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  } finally {
    await maintenancePool?.end()
  }
})

const api = (method, path, actor) => request(app)[method]('/api' + path).auth(actor.accessToken, { type: 'bearer' })

async function project(actor = owner) {
  const response = await api('post', '/projects', actor).send({ name: 'Release project' }).expect(201)
  return response.body.data
}

async function task(project_id, fields = {}, actor = owner) {
  const response = await api('post', '/tasks', actor).send({ title: 'Backend draft', project_id, due_date, ...fields }).expect(201)
  return response.body.data
}

test('registration normalizes email and stores only a bcrypt hash', async () => {
  const response = await request(app).post('/api/auth/register')
    .send({ ...credentials('Newbie'), email: 'NEWBIE@example.test' }).expect(201)
  expect(response.body.data).toMatchObject({ role: 'User', email: 'newbie@example.test' })
  expect(response.body.data).not.toHaveProperty('password')
  const { rows: [stored] } = await pool.query('SELECT password FROM users WHERE id = $1', [response.body.data.id])
  expect(stored.password).toMatch(/^\$2[aby]\$12\$/)
})

test('case-insensitive duplicate emails conflict, including simultaneous requests', async () => {
  const input = credentials('Race')
  const results = await Promise.all([
    request(app).post('/api/auth/register').send(input),
    request(app).post('/api/auth/register').send({ ...input, email: input.email.toUpperCase() })
  ])
  expect(results.map(result => result.status).sort()).toEqual([201, 409])
})

test('login issues a bearer token and hides the hash', () => {
  expect(owner.accessToken).toEqual(expect.any(String))
  expect(owner.user).toMatchObject({ email: 'owner@example.test', role: 'User' })
  expect(owner.user).not.toHaveProperty('password')
})

test('wrong password and unknown email receive the same login error', async () => {
  const wrong = await request(app).post('/api/auth/login').send({ email: owner.user.email, password: 'wrong-password' }).expect(401)
  const unknown = await request(app).post('/api/auth/login').send({ email: 'unknown@example.test', password }).expect(401)
  expect(unknown.body).toEqual(wrong.body)
})

test('protected routes reject missing, invalid and expired JWTs', async () => {
  await request(app).get('/api/projects').expect(401)
  await api('get', '/projects', { accessToken: 'invalid' }).expect(401)
  const expired = jwt.sign({}, config.JWT_SECRET, {
    issuer: 'graphketing-task-api', subject: String(owner.user.id), expiresIn: -1
  })
  const response = await api('get', '/projects', { accessToken: expired }).expect(401)
  expect(response.body.message).toMatch(/expired/)
})

test('registration rejects role injection', async () => {
  await request(app).post('/api/auth/register').send({ ...credentials('Injected'), role: 'Admin' }).expect(400)
  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE email = $1', ['injected@example.test'])
  expect(rowCount).toBe(0)
})

test('project CRUD scopes visibility and cascades task deletion', async () => {
  const created = await project()
  const child = await task(created.id, { assigned_to: assignee.user.id })
  expect(created.created_by).toBe(owner.user.id)
  const ownList = await api('get', '/projects', owner).expect(200)
  expect(ownList.body.data.map(row => row.id)).toContain(created.id)
  const visible = await api('get', '/projects/' + created.id, assignee).expect(200)
  expect(visible.body.data.id).toBe(created.id)
  const hidden = await api('get', '/projects', outsider).expect(200)
  expect(hidden.body.data.map(row => row.id)).not.toContain(created.id)
  await api('get', '/projects/' + created.id, outsider).expect(404)
  await api('put', '/projects/' + created.id, assignee).send({ name: 'Forbidden' }).expect(403)
  await api('delete', '/projects/' + created.id, assignee).expect(403)
  const updated = await api('put', '/projects/' + created.id, admin).send({ description: 'Release scope' }).expect(200)
  expect(updated.body.data).toMatchObject({ name: created.name, description: 'Release scope' })
  await api('delete', '/projects/' + created.id, owner).expect(200)
  await api('get', '/tasks/' + child.id, admin).expect(404)
})

test('task CRUD permits assignee status updates and protects sibling tasks', async () => {
  const { id } = await project()
  const assigned = await task(id, { assigned_to: assignee.user.id })
  const sibling = await task(id)
  const path = '/tasks/' + assigned.id
  expect(assigned).toMatchObject({ due_date, status: 'Pending', priority: 'Medium', assigned_to: assignee.user.id })
  await api('get', path, assignee).expect(200)
  await api('get', '/tasks/' + sibling.id, assignee).expect(404)
  await api('put', path, outsider).send({ status: 'Completed' }).expect(404)
  await api('put', path, assignee).send({ status: 'Completed', title: 'Forbidden' }).expect(403)
  await api('delete', path, assignee).expect(403)
  await api('post', '/tasks', assignee).send({ project_id: id, due_date, title: 'Forbidden' }).expect(403)
  const updated = await api('put', path, assignee).send({ status: 'In Progress' }).expect(200)
  expect(updated.body.data.status).toBe('In Progress')
  expect(Date.parse(updated.body.data.updated_at)).toBeGreaterThan(Date.parse(assigned.updated_at))
  const reassigned = await api('put', path, owner).send({ assigned_to: null, priority: 'High' }).expect(200)
  expect(reassigned.body.data).toMatchObject({ assigned_to: null, priority: 'High' })
  await api('get', path, assignee).expect(404)
  await api('delete', path, admin).expect(200)
  await api('get', path, owner).expect(404)
})

test('task fields and references are validated', async () => {
  const { id } = await project()
  const payload = { title: 'Validate fields', project_id: id, due_date }
  for (const invalid of [{ assigned_to: 2147483647 }, { priority: 'Urgent' }, { status: 'Done' },
    { due_date: '2027-02-30' }, { due_date: undefined }, { project_id: '1' }]) {
    await api('post', '/tasks', owner).send({ ...payload, ...invalid }).expect(400)
  }
  await api('post', '/tasks', owner).send({ ...payload, project_id: 2147483647 }).expect(404)
  const created = await task(id)
  await api('put', '/tasks/' + created.id, owner).send({ assigned_to: 2147483647 }).expect(400)
  await api('put', '/tasks/' + created.id, owner).send({ project_id: id }).expect(400)
})

test('combined task filters respect visibility before ordering, counts and pagination', async () => {
  const { id } = await project()
  const assigned_to = assignee.user.id
  const first = await task(id, { title: 'Backend % first', priority: 'High', assigned_to })
  const second = await task(id, { title: 'Backend % second', priority: 'High', assigned_to })
  await task(id, { title: 'Backend % hidden', priority: 'High' })
  await task(id, { title: 'Backend other', priority: 'High', assigned_to })
  await task(id, { title: 'Backend % low', priority: 'Low', assigned_to })
  await task(id, { title: 'Backend % completed', priority: 'High', status: 'Completed', assigned_to })
  const query = { search: 'bAcKeNd %', status: 'Pending', priority: 'High', project_id: id, assigned_to, limit: 1 }
  const page1 = await api('get', '/tasks', assignee).query(query).expect(200)
  const page2 = await api('get', '/tasks', assignee).query({ ...query, page: 2 }).expect(200)
  const page3 = await api('get', '/tasks', assignee).query({ ...query, page: 3 }).expect(200)
  expect(page1.body.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 })
  expect(page1.body.data.map(row => row.id)).toEqual([second.id])
  expect(page2.body.data.map(row => row.id)).toEqual([first.id])
  expect(page3.body.data).toEqual([])
  expect(page3.body.pagination.total).toBe(2)
  const defaults = await api('get', '/tasks', outsider).expect(200)
  expect(defaults.body.pagination).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 })
})

test('dashboard counts match visibility and admins receive global totals', async () => {
  const { id } = await project(outsider)
  await task(id, { assigned_to: outsider.user.id, status: 'Completed' }, outsider)
  await task(id, { status: 'In Progress' }, outsider)
  const scoped = await api('get', '/dashboard/stats', outsider).expect(200)
  expect(scoped.body.data).toEqual({ totalProjects: 1, totalTasks: 2, pendingTasks: 0, inProgressTasks: 1, completedTasks: 1, assignedToMe: 1 })
  const global = await api('get', '/dashboard/stats', admin).expect(200)
  const { rows: [counts] } = await pool.query(`SELECT
    (SELECT count(*)::integer FROM projects) AS "totalProjects",
    count(*)::integer AS "totalTasks",
    count(*) FILTER (WHERE status = 'Pending')::integer AS "pendingTasks",
    count(*) FILTER (WHERE status = 'In Progress')::integer AS "inProgressTasks",
    count(*) FILTER (WHERE status = 'Completed')::integer AS "completedTasks"
    FROM tasks`)
  expect(global.body.data).toEqual({ ...counts, assignedToMe: 0 })
})

test('invalid input and nonexistent resources use consistent JSON errors', async () => {
  await api('post', '/projects', owner).send({ name: '' }).expect(400)
  await api('post', '/projects', owner).send({ name: 'Valid', created_by: outsider.user.id }).expect(400)
  await api('put', '/projects/1', owner).send({}).expect(400)
  await api('get', '/projects/nope', owner).expect(400)
  await api('get', '/projects/%', owner).expect(400, { success: false, message: 'Invalid URL parameter' })
  await api('get', '/projects/2147483647', owner).expect(404)
  for (const query of ['limit=101', 'page=0', 'project_id=2147483648', 'assigned_to=1&assigned_to=2', 'status=Done', 'unexpected=1']) {
    await api('get', '/tasks?' + query, owner).expect(400)
  }
  const missing = await api('get', '/unknown', owner).expect(404)
  expect(missing.body).toEqual({ success: false, message: 'Route not found' })
})

test('malformed JSON, oversized payloads and auth throttles use JSON errors', async () => {
  await request(app).post('/api/auth/register').type('json').send('{').expect(400)
  await request(app).post('/api/auth/register').set('Content-Type', 'application/json; charset=iso-8859-1')
    .send('{}').expect(415)
  await request(app).post('/api/auth/register').send({ extra: 'a'.repeat(17000) }).expect(413)
  const limitedApp = createApp(pool, config)
  for (let index = 0; index < 20; index++) {
    await request(limitedApp).post('/api/auth/login').send({}).expect(400)
  }
  const blocked = await request(limitedApp).post('/api/auth/login').send({}).expect(429)
  expect(blocked.body).toEqual({ success: false, message: 'Too many authentication requests' })
})

test('Swagger UI and its same-origin assets expose all 13 operations', async () => {
  await request(app).get('/api-docs/').expect(200)
  await request(app).get('/api-docs/swagger-ui-init.js').expect(200)
  const { body } = await request(app).get('/api-docs.json').expect(200)
  expect(Object.values(body.paths).flatMap(Object.keys)).toHaveLength(13)
})

test('the database enforces references, constraints and timestamp behavior independently of HTTP', async () => {
  const { id } = await project()
  const account = await createUser(pool, credentials('SchemaAssignee'))
  await expect(pool.query('DELETE FROM users WHERE id = $1', [owner.user.id])).rejects.toHaveProperty('code', '23503')
  await expect(pool.query('INSERT INTO projects (name, created_by) VALUES ($1, $2)', ['Missing creator', 2147483647]))
    .rejects.toHaveProperty('code', '23503')
  const insert = 'INSERT INTO tasks (title, project_id, assigned_to, due_date) VALUES ($1, $2, $3, $4)'
  await expect(pool.query(insert, ['Missing project', 2147483647, account.id, due_date])).rejects.toHaveProperty('code', '23503')
  await expect(pool.query(insert, ['Missing assignee', id, 2147483647, due_date])).rejects.toHaveProperty('code', '23503')
  await expect(pool.query(insert, ['Missing due date', id, account.id, null])).rejects.toHaveProperty('code', '23502')
  const { rows: [created] } = await pool.query(insert + ' RETURNING id, status, priority, updated_at',
    ['Database assignment', id, account.id, due_date])
  expect(created).toMatchObject({ status: 'Pending', priority: 'Medium' })
  await expect(pool.query('UPDATE tasks SET status = $1 WHERE id = $2', ['Invalid', created.id]))
    .rejects.toHaveProperty('code', '23514')
  await expect(pool.query('UPDATE tasks SET priority = $1 WHERE id = $2', ['Invalid', created.id]))
    .rejects.toHaveProperty('code', '23514')
  await expect(pool.query('UPDATE users SET role = $1 WHERE id = $2', ['Invalid', account.id]))
    .rejects.toHaveProperty('code', '23514')
  await pool.query('DELETE FROM users WHERE id = $1', [account.id])
  const { rows: [unassigned] } = await pool.query('SELECT assigned_to, updated_at FROM tasks WHERE id = $1', [created.id])
  expect(unassigned.assigned_to).toBeNull()
  expect(unassigned.updated_at.getTime()).toBeGreaterThan(created.updated_at.getTime())
  const { rows: indexes } = await pool.query('SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema()')
  expect(Object.fromEntries(indexes.map(index => [index.indexname, index.indexdef]))).toMatchObject({
    users_email_key: expect.stringMatching(/UNIQUE.*\(email\)$/),
    projects_creator_idx: expect.stringMatching(/\(created_by\)$/),
    tasks_project_idx: expect.stringMatching(/\(project_id\)$/),
    tasks_assignee_project_idx: expect.stringMatching(/\(assigned_to, project_id\)$/)
  })
})

test('unexpected failures return generic JSON without internal details', async () => {
  const failingPool = { query: async () => { throw new Error('internal database detail') } }
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await request(createApp(failingPool, config)).get('/api/projects').auth(owner.accessToken, { type: 'bearer' })
      .expect(500, { success: false, message: 'Internal server error' })
    expect(errorLog).toHaveBeenCalledTimes(1)
  } finally {
    errorLog.mockRestore()
  }
})
