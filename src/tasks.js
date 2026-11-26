import { HttpError, success } from './http.js'
import { isAdmin } from './auth.js'
import { requireProjectManager } from './projects.js'

export const visibleTask = '($2::boolean OR p.created_by = $1 OR t.assigned_to = $1)'
const taskColumns = 't.id, t.title, t.description, t.project_id, t.assigned_to, t.priority, t.status, t.due_date::text AS due_date, t.created_at, t.updated_at'

export function taskHandlers(pool) {
  return {
    list: async (req, res) => {
      const { search, page, limit, ...filters } = req.validated.query
      const values = [req.user.id, isAdmin(req.user)]
      const conditions = [visibleTask]
      if (search !== undefined) {
        const pattern = search.replace(/[!%_]/g, character => '!' + character)
        conditions.push(`t.title ILIKE $${values.push('%' + pattern + '%')} ESCAPE '!'`)
      }
      for (const [column, value] of Object.entries(filters)) {
        conditions.push(`t.${column} = $${values.push(value)}`)
      }
      const limitParam = values.push(limit)
      const offsetParam = values.push((page - 1) * limit)
      const { rows: [result] } = await pool.query(
        `WITH matching AS (
           SELECT ${taskColumns} FROM tasks t JOIN projects p ON p.id = t.project_id
           WHERE ${conditions.join(' AND ')}
         ), page_rows AS (
           SELECT * FROM matching ORDER BY id DESC LIMIT $${limitParam} OFFSET $${offsetParam}
         )
         SELECT (SELECT count(*)::integer FROM matching) AS total,
           COALESCE((SELECT jsonb_agg(page_rows ORDER BY id DESC) FROM page_rows), '[]'::jsonb) AS tasks`,
        values
      )
      const pagination = { total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) }
      return success(res, 200, 'Tasks retrieved', result.tasks, { pagination })
    },
    create: async (req, res) => {
      const { title, description, project_id, assigned_to, priority, status, due_date } = req.validated.body
      await requireProjectManager(pool, req.user, project_id)
      await checkAssignee(pool, assigned_to)
      const { rows: [task] } = await pool.query(
        `INSERT INTO tasks AS t (title, description, project_id, assigned_to, priority, status, due_date)
         VALUES ($1, $2, $3, $4, COALESCE($5, 'Medium'), COALESCE($6, 'Pending'), $7)
         RETURNING ${taskColumns}`,
        [title, description, project_id, assigned_to, priority, status, due_date]
      )
      return success(res, 201, 'Task created', task)
    },
    detail: async (req, res) => {
      const { created_by, ...task } = await findVisibleTask(pool, req.user, req.validated.params.id)
      return success(res, 200, 'Task retrieved', task)
    },
    update: async (req, res) => {
      const { id } = req.validated.params
      const changes = req.validated.body
      const current = await findVisibleTask(pool, req.user, id)
      const managesTask = isAdmin(req.user) || current.created_by === req.user.id
      if (!managesTask && (Object.keys(changes).length !== 1 || changes.status === undefined)) {
        throw new HttpError(403, 'Assignees may update only task status')
      }
      await checkAssignee(pool, changes.assigned_to)
      const values = [id, managesTask, req.user.id]
      // The strict update schema admits only the six writable column names.
      const assignments = Object.entries(changes).map(([column, value]) => `${column} = $${values.push(value)}`)
      const { rows: [task] } = await pool.query(
        `UPDATE tasks t SET ${assignments.join(', ')}
         WHERE t.id = $1 AND ($2::boolean OR t.assigned_to = $3) RETURNING ${taskColumns}`,
        values
      )
      if (!task) throw new HttpError(404, 'Task not found')
      return success(res, 200, 'Task updated', task)
    },
    remove: async (req, res) => {
      const { id } = req.validated.params
      const current = await findVisibleTask(pool, req.user, id)
      if (!isAdmin(req.user) && current.created_by !== req.user.id) {
        throw new HttpError(403, 'Task deletion requires project ownership')
      }
      const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [id])
      if (!rowCount) throw new HttpError(404, 'Task not found')
      return success(res, 200, 'Task deleted', { id })
    }
  }
}

async function findVisibleTask(pool, user, id) {
  const { rows: [task] } = await pool.query(
    `SELECT ${taskColumns}, p.created_by FROM tasks t JOIN projects p ON p.id = t.project_id
     WHERE ${visibleTask} AND t.id = $3`, [user.id, isAdmin(user), id]
  )
  if (!task) throw new HttpError(404, 'Task not found')
  return task
}

async function checkAssignee(pool, id) {
  if (id == null) return
  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE id = $1', [id])
  if (!rowCount) throw new HttpError(400, 'Assigned user does not exist')
}
