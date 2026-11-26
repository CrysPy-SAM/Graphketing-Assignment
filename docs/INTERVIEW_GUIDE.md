# Technical interview guide

**Architecture and request flow.** Express applies Helmet, CORS and the JSON body limit. Public authentication routes add an IP limiter. Protected routes verify the bearer token, load the user's role, and validate the route parameters, body or query. Each feature handler runs parameterized SQL via pg, then returns the success envelope. Express 5 forwards synchronous throws and rejected handler promises to the JSON error handler.

**Why PostgreSQL.** A project has one creator and many tasks. A task has one project and optionally one assignee. Foreign keys enforce these relationships even when writes occur outside the API. Checks enforce valid roles, status and priority. PostgreSQL also supports simultaneous aggregate counts through `FILTER`, literal title search through `ILIKE` and an update trigger for task timestamps.

**Authentication and roles.** Registration normalizes email before inserting into a column with a unique constraint. bcrypt uses a random salt and a cost factor of 12. The API caps passwords at 72 UTF-8 bytes to fit bcrypt's input limit. Login compares bcrypt hashes and issues a signed HS256 JWT whose subject is the user ID. Signature, issuer and expiry are verified on every protected request. The current role comes from the database, so changing a user's role there changes permissions on their next request. Password hashes stay outside API responses.

**Ownership and assignment.** A User can see projects they own or in which they have an assignment. For tasks, each row is visible only to the project creator, its assignee or an Admin. Assignment grants status updates and the SQL update rechecks the assignee to handle concurrent reassignment. Ownership and the task's project cannot be edited through the API.

**Validation and SQL injection.** Zod is strict about body fields and rejects unknown task query parameters. SQL values go through pg placeholders, and dynamic identifiers come from the validated schema's fixed field names. Title search escapes LIKE wildcard characters so a percent sign or underscore is treated literally. Task creation validates references and the foreign keys backstop concurrent changes.

**Pagination and dashboard.** The task listing applies permission, search and filter predicates in the same query. It counts matching rows and selects the requested slice in one statement, using descending ID for stable sorting. Dashboard SQL counts the same visible projects and tasks, with global visibility for Admin and a personal assignment count for every role.

**Errors and security.** The API reports validation errors with 400, authentication errors with 401, forbidden actions on visible rows with 403, and absent or hidden rows with 404. The unique email conflict returns 409. Unexpected errors return a generic 500. Rate limiting slows repeated login or registration, and request size limits bound JSON parsing work.

**Testing.** Supertest exercises HTTP requests with an isolated schema in a separate PostgreSQL database. Coverage includes concurrent registration, role enforcement, CRUD, assignment, invalid input, filters, pagination, and scoped dashboard results. The evidence script runs live HTTP calls against a separately started server and redacts secrets.

**Trade-offs and future work.** Hard deletion keeps the schema simple. A production deployment could add auditable status transitions, rotating refresh tokens, a shared rate-limit store and cursor pagination for large or frequently changing task lists.
