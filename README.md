# Task Management & Team Collaboration API

An Express REST API for registering users, organizing projects, assigning tasks, tracking progress and viewing dashboard counts. The implementation uses Node.js ES modules, PostgreSQL with pg, Zod, bcrypt, JWT, Jest, Supertest and Swagger UI.

## Local setup

Clone the [Graphketing-Assignment repository](https://github.com/CrysPy-SAM/Graphketing-Assignment).

```sh
git clone https://github.com/CrysPy-SAM/Graphketing-Assignment.git
cd Graphketing-Assignment
```

You need Node.js 22+, npm, and PostgreSQL 16 or newer. Create a database and a dedicated role using a PostgreSQL administrator session in psql.

```sql
CREATE ROLE task_api LOGIN;
\password task_api
CREATE DATABASE task_management OWNER task_api;
CREATE DATABASE task_management_test OWNER task_api;
```

Copy `.env.example` to `.env`, set `DATABASE_URL` with the new role and database, and set `JWT_SECRET` to generated random data. URL-encode the database password if it contains URI delimiters. Generate a secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm ci
npm run db:init
npm start
```

The initializer uses a transaction and an advisory lock, and can be rerun on this schema without clearing data. Start the API after initialization. Swagger UI is available at [localhost:5000/api-docs/](http://localhost:5000/api-docs/), with the raw OpenAPI document at `/api-docs.json`.

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | Local PostgreSQL connection URL. Compose uses `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` and `PGPASSWORD` instead. |
| `JWT_SECRET` | Private signing secret of at least 32 characters. |
| `JWT_EXPIRES_IN` | Token lifetime, default `1d`. Use a positive value with `s`, `m`, `h` or `d`. |
| `PORT`, `NODE_ENV` | HTTP port (default 5000) and runtime environment. |
| `CORS_ORIGINS` | Comma-separated allowed browser origins such as `http://localhost:5173`. Empty permits same-origin use and gives cross-origin browsers no access. |
| `TEST_DATABASE_URL` | Dedicated PostgreSQL test database URL. The role needs permission to create schemas. |
| `POSTGRES_PASSWORD` | PostgreSQL password for Compose. |

## Docker Compose

Copy `.env.example` to `.env` if needed, then uncomment and set `POSTGRES_PASSWORD` and set `JWT_SECRET`. Run `docker compose up --build`. Compose waits for PostgreSQL, initializes the schema, and checks HTTP readiness. The API is published on `127.0.0.1` at the configured host port. The named volume persists the database across `docker compose down` and subsequent startup. PostgreSQL stays on the Compose network.

## Authentication and permissions

Register with `name`, `email` and `password`, then log in with `email` and `password`. Send the returned `data.accessToken` as `Authorization: Bearer <token>` for protected endpoints. Swagger's **Authorize** dialog accepts the token.

Public registration creates a User. To provision an Admin, set `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the ignored `.env` file temporarily, run `npm run admin:create`, then remove those variables. The command requires an unused email and stores a bcrypt hash. With Compose, use the same CLI inside the API container with those variables passed from the invoking environment using `docker compose exec -e ADMIN_NAME -e ADMIN_EMAIL -e ADMIN_PASSWORD api npm run admin:create`.

| Action | Admin | Project creator | Task assignee | Other User |
| --- | --- | --- | --- | --- |
| Create a project | Yes | Yes | Yes | Yes |
| Read a project | All | Own | Projects containing assigned tasks | No |
| Update or delete a project | All | Own | No | No |
| Read a task | All | In own projects | Own assignments | No |
| Create or delete a task | All | In own projects | No | No |
| Update a task | All fields allowed by schema | In own projects | Status only | No |
| View dashboard | Global totals | Visible resources | Visible resources | Visible resources |

Rows outside a user's visibility return 404. Visible resources with insufficient write permissions return 403. A task stays under its original project. The `PUT` endpoints apply the supplied fields and require at least one. Project and task descriptions and task assignments can be cleared with `null`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create a User |
| POST | `/api/auth/login` | Obtain an access token |
| GET | `/api/projects` | List visible projects |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects/:id` | Read a project |
| PUT | `/api/projects/:id` | Update a project |
| DELETE | `/api/projects/:id` | Delete a project and its tasks |
| GET | `/api/tasks` | Search, filter and paginate visible tasks |
| POST | `/api/tasks` | Create a task with a project and due date |
| GET | `/api/tasks/:id` | Read a task |
| PUT | `/api/tasks/:id` | Update a task |
| DELETE | `/api/tasks/:id` | Delete a task |
| GET | `/api/dashboard/stats` | Read project and task counts |

Example task listing:

```text
GET /api/tasks?search=backend&status=In%20Progress&priority=High&project_id=1&assigned_to=2&page=1&limit=10
```

Filters combine with AND. Search matches a case-insensitive literal substring of the title. Pages are ordered by descending ID and default to page 1 with 10 records, capped at 100 per page. Responses contain `pagination.total`, `page`, `limit` and `totalPages`. A valid page beyond the last returns an empty array and retains the count. Priorities are Low, Medium and High. Statuses are Pending, In Progress and Completed. Due dates use `YYYY-MM-DD`.

The [Postman collection](docs/task-management.postman_collection.json) includes all 13 operations. For a full collection run against a disposable instance, set `baseUrl`, `email` and `password` in a local Postman environment. Use an unused email and a password of at least eight characters and at most 72 UTF-8 bytes. Login and creation requests populate the bearer token and resource IDs. The final requests remove the created task and project.

## Architecture and database

- `src/app.js` wires security middleware, request validation and routes. Express 5 forwards rejected async handlers to the central JSON error handler in `src/http.js`.
- `src/auth.js`, `src/projects.js`, `src/tasks.js` and `src/dashboard.js` implement each feature. `src/config.js` validates configuration and creates the PostgreSQL pool. `src/server.js` checks the schema before listening.
- `database/schema.sql` defines Users, Projects and Tasks. Users have unique normalized emails and are referenced by project creators and task assignees. Projects have many tasks. A project deletion cascades to its tasks. Creator deletion is restricted while projects reference the user. Assignee deletion clears assignments.
- `scripts/` contains schema initialization, Admin provisioning and HTTP evidence capture. `tests/` contains the Jest and Supertest suite. `docs/` contains the assessment checklist, execution evidence and interview guide.

SQL values are bound parameters. Strict request schemas determine writable columns and prevent client-supplied roles, owners and timestamps. Access predicates apply before counts and pagination. A database trigger maintains `updated_at`, including changes outside the task endpoint. Helmet, an explicit CORS allowlist, a 16 KB JSON limit and authentication throttling provide request protections.

## Tests and execution evidence

Uncomment and set `TEST_DATABASE_URL` in `.env` to the dedicated test database, then run `npm test`. The suite creates and drops its own randomly named schema, and uses Supertest against Express with a real PostgreSQL connection.

From a fresh clone, all 16 integration tests passed against PostgreSQL 16.16. The local API and Docker Compose each completed 18 HTTP requests covering all 13 required routes. The Postman collection also passed all 13 expected-status checks in Newman. See the [compliance report](docs/CHECKLIST.md) and [sanitized Compose HTTP evidence](docs/api-evidence.json). To recreate the HTTP evidence, start the API against a disposable database, optionally set `API_BASE_URL` to its local URL, and run `npm run evidence`. This registers disposable accounts, creates and removes a project, and records sanitized HTTP exchanges. To capture screenshots manually, repeat the requests using Swagger UI and crop any credentials or bearer tokens before saving the images.

## Scope and trade-offs

All mandatory application features are implemented. The bonuses included are Docker Compose, Swagger UI and automated integration tests. Optional refresh tokens, task activity logs and soft deletion are outside the implemented scope. Users log in again to replace an expired JWT. The IP rate limiter uses in-memory counters per API process. The Compose setup serves local HTTP. Offset pagination is predictable for this workload, while simultaneous inserts can shift later pages. See the [interview guide](docs/INTERVIEW_GUIDE.md) for design details.
