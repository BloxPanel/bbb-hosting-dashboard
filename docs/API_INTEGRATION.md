# Dashboard API integration contract

Status: **four browser-callable endpoints confirmed**. This repository is the frontend only. All backend requests use `src/services/api.ts` and exclusively resolve against `https://api.builtbybuzz.dev`. The client rejects missing configuration, alternate origins (including dashboard and workers.dev hosts), URL paths/credentials/query/fragment in the base, unsupported capabilities, and HTTP method overrides. It never falls back to the current page's origin. Redirects are rejected so an API redirect cannot send a request to a different host.

## Configuration

Set `VITE_API_BASE_URL=https://api.builtbybuzz.dev`. Checked-in `.env.development` and `.env.production` supply this public configuration; `.env.example` documents it. Local `.env`, `.env.local`, and mode-specific local overrides are ignored. Restart Vite or rebuild after changes. VITE variables are public bundle configuration: never put tokens or secrets in them.

## Confirmed endpoints

| Method | Path | Dashboard use |
| --- | --- | --- |
| GET | `/` | Informational response only (`connectivity.info`); never authentication |
| GET | `/v1/health` | Manual API connectivity check on login/sign-up (`connectivity.health`) |
| GET | `/v1/dev/project-count` | Development-only manual diagnostic (`connectivity.projectCount`); global database total, never an owned-site or account statistic |
| POST | `/api/billing/checkout` | `billing.checkout(projectId, bearerToken)` sends JSON `{ "project_id": "..." }` and `Authorization: Bearer ...` |
| POST | `/api/billing/webhook` | Stripe server-to-server only. Excluded from the client registry; the dashboard cannot call it through the API client. |

Response payloads are preserved rather than substituted with local data. The root and checkout response schemas have not been provided; checkout's service returns an unknown payload until its response/redirect contract is confirmed. Checkout UI remains unavailable pending a verified authentication/token acquisition flow. No real checkout or webhook was called during verification. Missing project IDs or bearer tokens reject locally. Tokens are supplied per request, never hardcoded or persisted in browser storage.

### Read-only verification on October 23, 2026

- GET `/v1/health`: HTTP 200, `{"success":true,"service":"bbb-hosting-api","status":"operational"}`.
- GET `/v1/dev/project-count`: HTTP 200, `{"success":true,"total":1}`. This is an observed database-wide total and may change; it is not a fixture or the current user's count.
- GET health with `Origin: https://hosting.builtbybuzz.dev`: HTTP 200, but no `Access-Control-Allow-Origin` response header was returned.
- OPTIONS checkout with that Origin, requested method POST and requested headers `authorization,content-type`: HTTP 405 with `{"error":"METHOD_NOT_ALLOWED"}` and no CORS allow headers.

Direct HTTP checks therefore confirm endpoint availability, **not working browser CORS**. The browser connectivity panel will report a connection/CORS error until the backend permits the dashboard origin.

## CORS requirements for the backend team (not changed here)

The API and dashboard are distinct origins. The backend must allow `https://hosting.builtbybuzz.dev` on actual responses and errors, respond successfully to OPTIONS preflights for browser-callable routes, and allow the appropriate GET/POST methods and `Authorization, Content-Type` request headers. When choosing allow-origin dynamically, include `Vary: Origin`. Agree on separate development origins if local browser checks should reach the live API.

Current confirmed calls use `credentials: "omit"` and explicit bearer authentication for checkout. A future server-managed cookie session contract would require an intentional client change to `credentials: "include"`, an exact allow-origin, `Access-Control-Allow-Credentials: true`, appropriate cookie attributes, CSRF protection and a verified cross-origin session design. Do not treat bearer and cookie flows as interchangeable.

No frontend proxy, no-cors mode, disabled browser security, Worker changes, DNS changes or backend changes are included. Network/CORS failures and HTTP/JSON errors surface actionable messages without fake success responses.

## Integration procedure for remaining features

1. Agree on authentication, paths, HTTP methods, error bodies, CSRF policy, pagination, and response validation with the bbb-hosting-api team.
2. Add only verified capabilities to the centralized registry. Existing unregistered service names and their request shapes (including site identification headers) are proposals, not existing endpoints; they fail before fetch.
3. Validate responses at the boundary against the interfaces in `src/types/index.ts`. Load authenticated website data into the app provider. Replace demo resource sources with API loading/error/retry flows.
4. Enable login, registration and production mutation controls only when the corresponding verified integrations exist. Implement session-expiry handling and account switching that clears cached account data. Login fields are editable and `/signup` is navigable, but both submission buttons remain disabled. They make no authentication/registration requests.
5. Exercise the authorization and billing acceptance cases below against staging before production release.

## Required capabilities

| Internal capability | Required behavior / result |
| --- | --- |
| auth.session | Authenticated UserAccount; distinguish unauthenticated, unavailable and forbidden |
| auth.login / auth.register / auth.logout | Registration and server-managed session creation/revocation; agree on password or external identity flow |
| sites.list / sites.get | Owned HostedWebsite records by immutable site ID, pagination and separate publication/billing/entitlement states |
| sites.create | Create a draft without paid entitlement; return stable ID |
| sites.update | Update permitted name/settings; site ID is immutable |
| sites.delete | Confirm deletion, handle files/domains and explain subscription disposition |
| files.list | Directory listing of HostedFile records with sizes, MIME types, timestamps and stable IDs |
| files.upload | Multipart or signed upload flow scoped to a site ID and path; limits, collision policy, progress and errors |
| files.rename / files.delete | Site-scoped file/folder operations, traversal protection, recursive-delete semantics |
| files.download | Authorized file bytes or a short-lived download URL; expiry and allowed origins |
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

Use HTTPS. Current requests omit cookies; see the explicit bearer and future session requirements above. Agree on secure, HttpOnly server-managed cookies if that session approach is selected, plus SameSite behavior, CSRF protection and permitted development origins. Do not put Stripe secrets, R2 credentials or session tokens in VITE variables or localStorage. For JSON services, confirm Content-Type and request validation. Error responses must not reveal secrets; support actionable validation errors and request IDs. Confirm downloadable/checkout URLs against allowed HTTPS origins before navigating.

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
