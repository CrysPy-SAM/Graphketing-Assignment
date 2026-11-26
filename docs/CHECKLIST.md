# Assessment checklist

| Requirement | Implementation and verification |
| --- | --- |
| Registration, login, bcrypt and JWT | `src/auth.js` and `scripts/create-admin.js`. Integration tests cover normalized unique email, login errors, invalid and expired JWTs, and public role injection. Admin provisioning was run against the disposable local database. |
| Project CRUD and ownership | `src/projects.js`. Integration tests cover visibility, ownership, Admin access and cascading task deletion. |
| Task CRUD, assignment, due date, priority and status | `src/tasks.js` and `src/validation.js`. Integration tests cover assignment changes, assignee-only status updates, sibling task visibility, reference checks and enum and date validation. |
| Search, filters and pagination | `GET /api/tasks`. Tests verify case-insensitive literal search, combined filters, scoped totals, deterministic pages and invalid query parameters. |
| Dashboard statistics | `GET /api/dashboard/stats`. Tests verify global Admin totals and User-scoped totals. |
| Database schema and relationships | `database/schema.sql`. The suite initialized the schema twice and verified uniqueness, cascade behavior and automatic task timestamps through API operations. |
| Modular Express API, environment configuration and JSON errors | `src/` and `.env.example`. Tests cover malformed and oversized JSON, request validation, missing routes and authentication throttling. |
| All 13 required endpoints | The integration suite exercises every endpoint. `api-evidence.json` contains 18 live HTTP exchanges across all 13. |
| Installation and API documentation | `README.md`, Swagger UI at `/api-docs/`, and `task-management.postman_collection.json`. Swagger UI assets and the 13-operation specification were checked over HTTP. |
| Docker, Swagger and test bonuses | The Docker image built successfully and the Compose stack served the API against PostgreSQL 16. The integration suite used PostgreSQL 18. |
| Git and submission | The workspace has local commits. Publishing to GitHub is a separate submission step. |
