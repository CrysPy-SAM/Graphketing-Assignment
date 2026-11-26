# Graphketing assessment compliance report

The application requirements in the original assessment were verified from a fresh clone. All 13 required endpoints responded successfully in both the local Node.js setup and Docker Compose. Publishing the local commits to the GitHub repository remains the submission step.

## Mandatory requirements

| Assessment requirement | Verification result |
| --- | --- |
| Register with name, email and password | `POST /api/auth/register` returned 201. Tests verified email normalization, a 409 for concurrent duplicate registrations, and that the database stores a bcrypt hash. Responses omit the password. |
| Log in with email and password | `POST /api/auth/login` returned 200 and a JWT with `Cache-Control: no-store`. Incorrect credentials returned a generic 401. The Admin provisioning CLI created an account that logged in as Admin. |
| JWT protection and Admin and User authorization | The protected routes share JWT and role middleware. Tests checked missing, invalid and expired tokens, public role injection, Admin access, creator access and assignee permissions. Invisible resources returned 404, and disallowed changes to visible resources returned 403. |
| Project CRUD and creator association | All five project routes completed over HTTP. Tests verified the authenticated creator was stored, visibility was scoped and project deletion removed its tasks. |
| Task CRUD, assignment, progress and due dates | All five task routes completed over HTTP. Tests verified assignment, optional unassignment, required valid due dates, all supported enum values across the suite, and status-only edits by assignees. |
| Search, filters and pagination | Tests verified case-insensitive title search, literal wildcard characters, combined status, priority, assignee and project filters, deterministic ordering and counts, and an empty page beyond the last. |
| Dashboard statistics | The endpoint returned all six required counts. Tests compared Admin totals with direct SQL and checked that Users receive scoped totals and personal assignment counts. |
| Node.js and Express, modular structure, reusable middleware | Reviewed the feature modules, shared validation and error handling, database access and process entry point. `npm ci` and `npm start` worked from a clean checkout with Node.js 22.17.1. |
| PostgreSQL schema, relationships and indexes | PostgreSQL 16.16 initialized the schema twice. Tests verified foreign keys, restricted creator deletion, cascading task deletion, assignee deletion clearing the assignment, enum checks, task defaults, required due dates and the timestamp trigger. The catalog showed indexes for unique email, project creator, task project and task assignee plus project. |
| Input validation and HTTP errors | Tests covered malformed path parameters and JSON, oversized payloads, unsupported character encoding, invalid or unexpected fields, invalid references, expired credentials, disallowed actions, missing resources, duplicate email, authentication throttling and generic 500 responses. |
| Environment configuration and secret handling | The fresh-clone workflow used an ignored `.env`. Source review checked password hashing, JWT signature and issuer verification, parameterized SQL and validation of writable fields. A pattern scan of tracked Git history found only the connection and secret placeholders in `.env.example`. The HTTP evidence was checked for redaction. |
| Git, README, schema, API documentation, environment example and execution evidence | The project has local commits, [setup instructions](../README.md), [schema SQL](../database/schema.sql), [Postman collection](task-management.postman_collection.json), [environment example](../.env.example) and [18 sanitized live HTTP exchanges](api-evidence.json). The PowerShell cache under `Microsoft/` was inspected by name and metadata and excluded from both Git and the Docker build context. |
| GitHub submission | Pending publication. The local branch is `main`. See the commands below. |

## Evaluation criteria

| Criterion | Marks | Observed evidence |
| --- | ---: | --- |
| API Development & Functionality | 25 | All 13 routes exercised over live HTTP on both deployments. |
| Database Design & Relationships | 15 | Schema installed twice and constraints, indexes and deletion behavior verified with PostgreSQL. |
| Authentication & Authorization | 15 | Registration, Admin provisioning, JWT verification, ownership, assignment and dashboard visibility verified. |
| Code Quality & Architecture | 15 | Modular Express design retained. Review fixes cover error handling, token response caching, Compose readiness and documentation. |
| Validation & Error Handling | 10 | Jest verified HTTP error statuses and consistent JSON, including generic handling of an internal failure. |
| Search, Filtering & Pagination | 10 | Jest and live HTTP verified combined filters and page metadata for visibility-scoped results. |
| Documentation & Testing | 10 | A new clone followed the README's local SQL and npm workflow. All 16 tests passed. Swagger operations match the live routes and Postman requests. |

## Optional work and verification scope

The Compose build passed. Both services became healthy, and an account created through the API persisted after `docker compose down` and a subsequent startup. Swagger UI and its initialization asset returned 200, and the OpenAPI operation map matched all 13 live routes. A Newman run of the Postman collection passed all 13 expected-status assertions. The project dependency audit reported zero vulnerabilities.

Refresh tokens, task activity logs and soft deletion are optional and are outside the implemented scope. The repository documents the local-only HTTP setup, process-local rate limiting and offset pagination.

## Publish to GitHub

Create an empty GitHub repository named `graphketing-backend-assessment`. Replace `YOUR_GITHUB_USERNAME` with the repository owner and run these commands from the project root.

```sh
git status --short
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/graphketing-backend-assessment.git
git push -u origin main
```
