import { isAdmin } from './auth.js'
import { success } from './http.js'
import { visibleProject } from './projects.js'
import { visibleTask } from './tasks.js'

export function dashboardHandler(pool) {
  return async (req, res) => {
    const { rows: [stats] } = await pool.query(
      `SELECT (SELECT count(*)::integer FROM projects p WHERE ${visibleProject}) AS "totalProjects",
         count(*)::integer AS "totalTasks",
         count(*) FILTER (WHERE t.status = 'Pending')::integer AS "pendingTasks",
         count(*) FILTER (WHERE t.status = 'In Progress')::integer AS "inProgressTasks",
         count(*) FILTER (WHERE t.status = 'Completed')::integer AS "completedTasks",
         count(*) FILTER (WHERE t.assigned_to = $1)::integer AS "assignedToMe"
       FROM tasks t JOIN projects p ON p.id = t.project_id WHERE ${visibleTask}`,
      [req.user.id, isAdmin(req.user)]
    )
    return success(res, 200, 'Dashboard statistics retrieved', stats)
  }
}
