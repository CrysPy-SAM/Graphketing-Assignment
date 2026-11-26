import { z } from 'zod'
import { HttpError } from './http.js'

const text = max => z.string().trim().min(1).max(max).refine(value => !value.includes('\0'))
const description = z.string().trim().max(5000).refine(value => !value.includes('\0')).nullable()
const id = z.number().int().positive().max(2147483647)
const integerQuery = z.string().regex(/^[1-9]\d*$/).transform(Number)
const idQuery = integerQuery.pipe(id)
const status = z.enum(['Pending', 'In Progress', 'Completed'])
const priority = z.enum(['Low', 'Medium', 'High'])
const email = text(254).pipe(z.email()).transform(value => value.toLowerCase()).meta({ format: 'email' })
const password = z.string().min(8).max(72).refine(value => Buffer.byteLength(value) <= 72, 'Use at most 72 UTF-8 bytes').describe('At most 72 UTF-8 bytes.')
const credentials = { email, password }
const nonempty = shape => z.strictObject(shape).partial().refine(value => Object.keys(value).length > 0, 'Provide at least one field').meta({ minProperties: 1 })

export const registration = z.strictObject({ name: text(120), ...credentials })
export const login = z.strictObject(credentials)
export const projectCreate = z.strictObject({ name: text(160), description: description.optional() })
export const projectUpdate = nonempty(projectCreate.shape)
const taskFields = {
  title: text(200),
  description: description.optional(),
  assigned_to: id.nullable().optional(),
  priority: priority.optional(),
  status: status.optional(),
  due_date: z.iso.date().refine(date => !date.startsWith('0000'))
}
export const taskCreate = z.strictObject({ ...taskFields, project_id: id })
export const taskUpdate = nonempty(taskFields)
export const resourceId = z.strictObject({ id: idQuery })
export const taskQuery = z.strictObject({
  search: text(200).optional(),
  status: status.optional(),
  priority: priority.optional(),
  assigned_to: idQuery.optional(),
  project_id: idQuery.optional(),
  page: integerQuery.pipe(id).default(1),
  limit: integerQuery.pipe(z.number().int().min(1).max(100)).default(10)
})

export function validate(source, schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      const issue = result.error.issues[0]
      throw new HttpError(400, (issue.path.length ? issue.path.join('.') + ': ' : '') + issue.message)
    }
    req.validated ??= {}
    req.validated[source] = result.data
    next()
  }
}
