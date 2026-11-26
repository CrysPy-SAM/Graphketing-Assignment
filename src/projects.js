import { HttpError, success } from './http.js'
import { isAdmin } from './auth.js'

export const visibleProject = `($2::boolean OR p.created_by = $1 OR EXISTS (
  SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.assigned_to = $1
))`

export function projectHandlers(pool) {
  return {
    list: async (req, res) => {
      const { rows } = await pool.query(
        `SELECT p.* FROM projects p WHERE ${visibleProject} ORDER BY p.id DESC`,
        [req.user.id, isAdmin(req.user)]
      )
      return success(res, 200, 'Projects retrieved', rows)
    },
    create: async (req, res) => {
      const { name, description } = req.validated.body
      const { rows: [project] } = await pool.query(
        'INSERT INTO projects (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
        [name, description, req.user.id]
      )
      return success(res, 201, 'Project created', project)
    },
    detail: async (req, res) => {
      const project = await findVisibleProject(pool, req.user, req.validated.params.id)
      return success(res, 200, 'Project retrieved', project)
    },
    update: async (req, res) => {
      const { id } = req.validated.params
      await requireProjectManager(pool, req.user, id)
      const { name, description } = req.validated.body
      const { rows: [project] } = await pool.query(
        `UPDATE projects SET name = COALESCE($2, name),
         description = CASE WHEN $3::boolean THEN $4 ELSE description END
         WHERE id = $1 RETURNING *`,
        [id, name, description !== undefined, description]
      )
      if (!project) throw new HttpError(404, 'Project not found')
      return success(res, 200, 'Project updated', project)
    },
    remove: async (req, res) => {
      const { id } = req.validated.params
      await requireProjectManager(pool, req.user, id)
      const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1', [id])
      if (!rowCount) throw new HttpError(404, 'Project not found')
      return success(res, 200, 'Project deleted', { id })
    }
  }
}

async function findVisibleProject(pool, user, id) {
  const { rows: [project] } = await pool.query(
    `SELECT p.* FROM projects p WHERE ${visibleProject} AND p.id = $3`, [user.id, isAdmin(user), id]
  )
  if (!project) throw new HttpError(404, 'Project not found')
  return project
}

export async function requireProjectManager(pool, user, id) {
  const project = await findVisibleProject(pool, user, id)
  if (!isAdmin(user) && project.created_by !== user.id) throw new HttpError(403, 'Project management requires ownership')
}
