# Dashboard API integration contract

Status: **customer authentication, project listing/creation, and project file management integrated from the supplied API contract**. This repository is the frontend only. All backend requests use `src/services/api.ts` and exclusively resolve against `https://api.builtbybuzz.dev`. The client rejects missing configuration, alternate origins (including dashboard and workers.dev hosts), URL paths/credentials/query/fragment in the base, unsupported capabilities, and HTTP method overrides. It never falls back to the current page's origin. Fetch requests reject redirects; browser-native XHR uploads verify that the final response origin remains the configured API origin.

## Configuration

Set `VITE_API_BASE_URL=https://api.builtbybuzz.dev`. Checked-in `.env.development` and `.env.production` supply this public configuration; `.env.example` documents it. Local `.env`, `.env.local`, and mode-specific local overrides are ignored. Restart Vite or rebuild after changes. VITE variables are public bundle configuration: never put tokens or secrets in them.

## Confirmed endpoints

| Method | Path | Dashboard use |
| --- | --- | --- |
| GET | `/` | Informational response only (`connectivity.info`); never authentication |
| GET | `/v1/health` | Manual API connectivity check on login/sign-up (`connectivity.health`) |
| GET | `/v1/dev/project-count` | Development-only manual diagnostic (`connectivity.projectCount`); global database total, never an owned-site or account statistic |
| GET | `/v1/projects` | Authenticated user's owned hosting projects (`projects.list`); the backend must enforce project ownership |
| POST | `/v1/projects` | Creates an authenticated user's project (`projects.create`) from `{ "name": "...", "slug": "..." }`; uses the session cookie and never sends an owner ID |
| GET | `/v1/projects/:projectId/files?limit=100&cursor=…` | Credentialed, paginated list: `{ success, files: [{ path, size, content_type, updated_at }], next_cursor }` |
| POST | `/v1/projects/:projectId/files?path=…` | Credentialed raw `File` body upload: `{ success, file: { path, size, content_type } }` |
| GET | `/v1/projects/:projectId/files/*` | Credentialed binary download for preview/download |
| PUT | `/v1/projects/:projectId/files/*` | Credentialed raw `File` body replacement: `{ success, file: { path, size, content_type } }` |
| DELETE | `/v1/projects/:projectId/files/*` | Credentialed file deletion: `{ success, deleted }` |
| GET | `/v1/projects/:projectId/storage` | Credentialed usage: `{ success, storage: { bytes_used, file_count, file_count_limit, quota_bytes, percent_used } }` |
| POST | `/api/billing/checkout` | `billing.checkout(projectId, bearerToken)` sends JSON `{ "project_id": "..." }` and `Authorization: Bearer ...` |
| POST | `/api/billing/webhook` | Stripe server-to-server only. Excluded from the client registry; the dashboard cannot call it through the API client. |

Response payloads are preserved rather than substituted with local data. The root and checkout response schemas have not been provided; checkout's service returns an unknown payload until its response/redirect contract is confirmed. Checkout UI remains unavailable pending a verified authentication/token acquisition flow. No real checkout or webhook was called during verification. Missing project IDs or bearer tokens reject locally. Tokens are supplied per request, never hardcoded or persisted in browser storage.

## Authentication contract

The supplied API contract now confirms GET `/v1/auth/me` and POST `/v1/auth/register`, `login`, `logout`, `verify-email`, `forgot-password`, and `reset-password`. All use credentials include, JSON POST bodies, the exact API origin, and redirect rejection. The browser supplies Origin. No administrator bearer token is used for authentication.

Login/me normalize a real user from a direct object, `{ user }`, `{ data: user }`, or `{ data: { user } }`. Required fields are string `id`, `email`, and `display_name` (or `name`); optional `email_verified` boolean/0/1, `email_verified_at`, and `role` populate account details. Unexpected shapes fail rather than inventing a profile. **The supplied contract did not include exact response examples; confirm these shapes with the backend before release.**

Registration sends email/display_name/password and handles 202 with a generic acknowledgment. Recovery also uses a generic acknowledgment. Verification/reset submit memory-only fragment tokens on user action. API error codes and status fallback produce sanitized user messages. A 401 from an existing session clears frontend account and resource state. Initial session failures show an error and leave the visitor logged out.

## Remaining integration checks

- No live credentials, account creation, recovery emails or production mutations were used for testing. Automated tests mock API responses.
- Verify credentialed CORS on the production dashboard origin, including OPTIONS and error responses: exact `Access-Control-Allow-Origin: https://hosting.builtbybuzz.dev`, `Access-Control-Allow-Credentials: true`, GET/POST/PUT/DELETE and Content-Type. Confirm development origins separately.
- Confirm the backend sets and revokes `__Host-bbb_session` with the intended Secure, HttpOnly, Path and SameSite settings and enforces its own Origin/CSRF checks. Frontend guards are presentation only.
- Verify real email templates target `https://hosting.builtbybuzz.dev/verify-email#token=...` and `/reset-password#token=...`.
- GitHub Pages fallback copies index.html and preserves fragments without redirects. The global no-referrer meta policy is effective in the document; a literal HTTP Referrer-Policy header requires hosting-layer support.
- `GET /v1/projects` uses the session cookie and accepts an array, `{ "projects": [...] }`, `{ "data": [...] }`, or `{ "data": { "projects": [...] } }`. Project records require an ID, name, slug and hosting status (`hosting_status`, `status`, or boolean `active`); `created_at` is optional. Website URLs are built from the validated slug on `builtbybuzz.dev`. The backend must scope this endpoint to the authenticated user; frontend filtering is not an authorization boundary.
- `POST /v1/projects` accepts only `name` and `slug` from the client. The current frontend requires a trimmed 1–80-character name, a 1–63-character DNS-label slug, and rejects common reserved subdomains (`admin`, `api`, `app`, `assets`, `cdn`, `dashboard`, `ftp`, `hosting`, `login`, `mail`, `register`, `static`, `status`, `support`, `www`). The supplied backend contract does not define name limits, slug syntax, the authoritative reserved list, or error-code schemas for HTTP 400/403/409; align these frontend checks and sanitized messages with the backend before release. The backend remains authoritative for validation, reservation, authentication, and ownership.
- Website detail, domain, deployment and billing response contracts remain unconnected. These capabilities fail closed and must enforce ownership in the backend.
- Project file writes require `Content-Length`. The dashboard sends a browser-native `File` with XHR and never sets the forbidden header itself; the Playwright browser test checks the actual request length. HTTP 411 is reported as a compatibility error if a browser omits it.
- File mutation requires the production dashboard Origin. The backend accepts only `https://hosting.builtbybuzz.dev`; production writes must be verified from that origin.
- Before using the file API, apply backend migration `0006_project_file_management.sql` and deploy the updated Worker. The dashboard does not run migrations or deploy the Worker.
- Profile updates remain disabled. Do not infer a profile-update or bearer acquisition endpoint from the cookie authentication contract.

### Project file-management rules

The backend permits only static website extensions: HTML, CSS, JS/MJS, JSON, webmanifest, TXT, Markdown, XML, CSV, SVG, PNG/JPEG/GIF/WebP/AVIF/ICO/BMP, WOFF/WOFF2/TTF/OTF/EOT, PDF, source maps and WASM. The dashboard mirrors that allowlist and rejects protected infrastructure names and unsafe path segments before upload. Backend validation remains authoritative.

Limits are 25 MiB per file, 1 GiB and 10,000 files per project, 100 files per listing page, 30 mutations/minute, 60 file reads/minute and 10 storage scans/minute. The UI checks returned storage usage and refreshes listing/storage after mutations. API errors are sanitized into actionable messages. Listing is paginated because the backend endpoint lists the project prefix rather than accepting a directory filter; folders are synthesized from the loaded object paths.

The upload handler requires `Content-Length`, which JavaScript may not set directly. XHR sends the original `File` body so the browser calculates transport framing and exposes upload progress; the application does not attempt to set a forbidden header. If the deployed Worker returns `CONTENT_LENGTH_REQUIRED` from a supported browser, the backend must be adjusted (for example, accept a trustworthy declared size through an allowed header or derive it safely from a supported request format) before production use.

Project files are private while hosting is inactive. Uploading and replacement do not publish or deploy a website. The backend checks project ownership for every operation and does not accept an owner ID or expose R2 credentials. Demo mode only changes files in browser memory and never invokes file APIs.

## Required capabilities

| Internal capability | Required behavior / result |
| --- | --- |
| auth.session | Authenticated UserAccount; distinguish unauthenticated, unavailable and forbidden |
| auth.login / auth.register / auth.logout | Connected cookie authentication; verify real response shapes before release |
| projects.list | Authenticated user's owned projects with ID, name, slug, hosting status and optional creation date |
| projects.create | Create a project using only name and slug; refresh the authenticated project list after HTTP 201 and use the backend's hosting status |
| sites.get | Website detail by immutable site ID; response contract is not connected |
| sites.create | Create a draft without paid entitlement; return stable ID |
| sites.update | Update permitted name/settings; site ID is immutable |
| sites.delete | Confirm deletion, handle files/domains and explain subscription disposition |
| files.list | Project-scoped file listing with pagination; virtual folders are derived from object paths |
| files.upload / files.replace / files.delete / files.download / files.storage | Connected through the session cookie; API verifies project ownership and applies path, extension, quota and rate-limit checks |
| billing.entitlement | HostingEntitlement for one specific site, including explicit backend-issued owner grant |
| billing.site | HostingSubscription for that site; actual renewal date, price and status |
| billing.checkout (request confirmed; response integration pending) | Server creates Stripe Checkout Session for the authorized `project_id`; verify the response and safe redirect contract |
| billing.portal | Manage one site's individual subscription; confirm portal semantics cannot affect unrelated sites accidentally |
| billing.summary | All owned subscriptions, active count and expected annual base cost; taxes/invoices separately |
| domains.list / domains.add / domains.remove | Assigned hosting address and custom aliases with verification status |
| domains.instructions / domains.verify | Actual DNS targets, challenge records and verification result |
| deployments.list | Site-scoped Deployment history and pagination |
| deployments.publish | Backend verifies entitlement before publication, reports asynchronous state/errors |
| account.update | Allowed profile fields, validation and optional email re-verification |

Domain mutation and deployment publication service functions will be added once their contracts are confirmed. No invented DNS values or publication endpoint are supplied.

## Data and session expectations

Use HTTPS. Authentication includes the server-managed cookie; diagnostics omit credentials and checkout retains its separate bearer contract. Never put secrets or session tokens in VITE variables or browser storage. Confirm downloadable/checkout URLs against allowed HTTPS origins before navigating.

All authorization is enforced by the backend. Frontend state and disabled buttons are presentation only. API results must never be inferred from demo state. Dates must include a clear timezone; missing renewal dates must remain unavailable.

## Billing rules and staging acceptance

- One active $10 USD annual subscription covers one immutable website ID.
- A paid website and an unpaid website: only the paid site has subscription entitlement.
- A payment failure or cancellation for A leaves B unchanged.
- Billing active does not imply published; draft publication may coexist with active billing.
- Aliases belong to a website and do not add subscriptions or free hosting.
- Backend-issued owner grants can provide entitlement without a subscription; report source explicitly.
- Checkout completion redirects never grant client-side access. Refetch backend entitlement after webhook processing, with a pending state while processing.
- Deleting an active website must disclose whether its separate subscription continues; the UI currently warns that deletion does not cancel billing.
- Account totals count active subscriptions, not aliases or grants. Actual invoices may include tax or other adjustments.

The frontend does not implement Stripe webhooks, D1 migrations, R2 credentials or the public hosting Worker.
