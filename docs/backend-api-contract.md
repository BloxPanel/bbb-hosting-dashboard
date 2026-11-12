# Customer authentication contract

Base URL: `https://api.builtbybuzz.dev`. Only the exact browser Origin
`https://hosting.builtbybuzz.dev` is accepted for authentication writes, including
login, registration and token redemption. Missing/opaque origins are rejected.
Local API development retains this Origin requirement; use a local reverse proxy
for the dashboard or explicitly review a development-only allowlist change.

Use `fetch(base + path, { credentials: 'include', ... })` on every auth call.
POST JSON using `Content-Type: application/json`; the browser supplies Origin.
Never store session credentials in localStorage or put admin bearer tokens in
frontend code. The API sets a host-only `__Host-bbb_session` cookie with Secure,
HttpOnly, SameSite=Lax, Path=/, and seven-day Max-Age. These HTTPS origins are
cross-origin but same-site. Credentialed CORS is enabled on auth routes, owner
invitation management, invitation validation/redemption and project routes. Strict Origin
validation prevents CSRF even from another customer subdomain;
SameSite alone would not protect against those sibling sites. Credentialed CORS
also covers the owner invitation endpoints and invitation redemption; public
invitation validation is public but supports the dashboard's credentialed CORS request.

| Method | Path | JSON input | Success |
| --- | --- | --- | --- |
| POST | `/v1/auth/register` | `email`, `display_name`, `password`, `invitation_token` | 202 generic acknowledgment; no session |
| POST | `/v1/auth/login` | `email`, `password` | 200 `{success:true,user}` plus cookie |
| GET | `/v1/auth/me` | none | 200 with the account and current `prealpha_access` boolean, or 401 |
| POST | `/v1/auth/logout` | none | 200, revokes current session and clears cookie |
| POST | `/v1/auth/verify-email` | `token` | 200 or 400 invalid/expired/used |
| POST | `/v1/auth/forgot-password` | `email` | 202 identical acknowledgment for all valid emails |
| POST | `/v1/auth/reset-password` | `token`, `password` | 200, clears cookie and revokes all user sessions |
| POST | `/v1/invitations/validate` | `token` | 200 `{success:true,valid:true}`; no invited email returned |
| POST | `/v1/invitations/redeem` | optional `token` | 200 after verified login; grants durable pre-alpha access |
| GET | `/v1/owner/invitations` | optional `limit`, `cursor` query | Owner-only invitation metadata list |
| POST | `/v1/owner/invitations` | `email`, optional `expires_in_seconds`, optional `notes` | Owner-only; returns plaintext token once |
| GET | `/v1/owner/invitations/:id` | none | Owner-only invitation status |
| POST | `/v1/owner/invitations/:id/revoke` | none | Owner-only pending invitation revocation |
| POST | `/v1/owner/testers/:userId/revoke` | none | Owner-only tester entitlement revocation |

`GET /v1/auth/me` preserves the existing user fields and adds a live authorization
field. Exact success shape:

```json
{
  "success": true,
  "user": {
    "id": "account-uuid",
    "email": "tester@example.com",
    "display_name": "Tester",
    "role": "customer",
    "email_verified_at": 1794268800,
    "prealpha_access": true
  }
}
```

`prealpha_access` is recalculated from the current database state on each call.
It is `true` for the platform owner or an account with an active tester
entitlement, and `false` for unauthorized, disabled, or revoked tester accounts.

User fields: immutable `id`, normalized `email`, `display_name`, backend `role`,
nullable Unix timestamp `email_verified_at`, and current boolean
`prealpha_access`. Public registration always creates a customer regardless of
supplied role or owner IDs. API errors use
the fields `success:false`, an `error` identifier, numeric BBB `code`, and safe
`message`. Common codes: INVALID_INPUT (400),
INVALID_TOKEN (400), INVALID_CREDENTIALS / UNAUTHORIZED (401), ORIGIN_DENIED
(403), invitation-specific codes 6001–6007, RATE_LIMITED (429),
AUTH_UNAVAILABLE (503). Wrong methods return 405.
Auth responses are never cacheable. Passwords require at least 12 characters and
at most 1,024 UTF-8 bytes. Email length is at most 254 and name length 100.
JSON bodies are stream-limited to 8 KiB. Registration duplicates get the same
202 body when supplied a valid invitation; failed logins use a dummy hash for
unknown users. Registration creates unverified accounts; no feature should treat
successful registration or login as proof of email ownership.

Closed pre-alpha registration requires a valid `invitation_token` whose
normalized intended email matches the submitted registration email. Registration
creates only the normal unverified customer account; it does not redeem the
invitation or grant access. In the same D1 batch, the matching pending invitation
is bound to the account ID. This durable pending binding lets the user close or
reload the browser, finish the normal email-verification flow, log in, then
redeem with an empty JSON object. No raw token needs to remain in browser memory
for hours or be persisted client-side. Alternatively, the user may safely reopen
the original invitation link and redeem by sending its token in the request body:
the invitation remains unredeemed until the verified account redeems it, and
email/account binding still applies. The dashboard can use a fragment-based link
such as `https://hosting.builtbybuzz.dev/invite#token=<token>`; fragments are
not sent to the API host. The dashboard should remove the fragment after reading
it, and send the token only in a JSON request body. Never put tokens in query
strings, logs, analytics or localStorage.
Validation errors distinguish invalid, expired, revoked, already-redeemed and
email-mismatch conditions without returning the intended email address.

Exact registration request:

```json
{
  "email": "tester@example.com",
  "display_name": "Tester",
  "password": "a sufficiently long password",
  "invitation_token": "64-lowercase-hex-characters"
}
```

HTTP `202 Accepted` response:

```json
{
  "success": true,
  "message": "Registration received. If eligible, verification instructions will be sent."
}
```

## Invitation API request and response contract

All examples below use `https://api.builtbybuzz.dev`. JSON endpoints require
`Content-Type: application/json`. Owner routes require the authenticated,
verified owner session cookie; owner mutations and redemption also require the
exact dashboard Origin. Public validation does not require an Origin. `:id` is
the invitation UUID and `:userId` is the account ID.
Every success/error response is `Cache-Control: no-store`; invitation responses
also include `Pragma: no-cache`, `X-Content-Type-Options: nosniff`, and
`Referrer-Policy: no-referrer`. Response fields shown below are the complete
application JSON shapes.

The shared invitation metadata object is exactly:

```json
{
  "id": "invitation-uuid",
  "intended_email": "tester@example.com",
  "created_at": 1794268800,
  "expires_at": 1794873600,
  "redeemed_at": null,
  "revoked_at": null,
  "redeemed_by_user_id": null,
  "created_by_user_id": "owner-account-uuid",
  "notes": null,
  "status": "pending"
}
```

Timestamps are Unix seconds. `status` is exactly one of `pending`, `expired`,
`revoked`, or `redeemed`; it is calculated in that precedence order (revoked,
redeemed, expired, pending). Owner metadata never includes token plaintext,
token hashes, or the internal pending-registration account binding.

### Owner invitation creation

`POST /v1/owner/invitations`

Exact request shape (`expires_in_seconds` and `notes` may be omitted):

```json
{
  "email": "tester@example.com",
  "expires_in_seconds": 604800,
  "notes": "Pre-alpha cohort"
}
```

`email` is trimmed/lowercased; expiry defaults to 604800 seconds and must be
between 3600 and 2592000 seconds. `notes` is either a string of at most 1000
characters or `null`.

HTTP `201 Created` response:

```json
{
  "success": true,
  "invitation": {
    "id": "invitation-uuid",
    "intended_email": "tester@example.com",
    "created_at": 1794268800,
    "expires_at": 1794873600,
    "redeemed_at": null,
    "revoked_at": null,
    "redeemed_by_user_id": null,
    "created_by_user_id": "owner-account-uuid",
    "notes": "Pre-alpha cohort",
    "status": "pending"
  },
  "token": "64-lowercase-hex-characters"
}
```

The `token` is 32 cryptographically random bytes encoded as lowercase hex. This
is its only API response; store it only where needed to compose the invitation
link. No invitation link is emailed by this API.

### Owner invitation listing

`GET /v1/owner/invitations?limit=50&cursor=1794268800:invitation-uuid`

Both query parameters are optional. `limit` defaults to 50 and is 1–100.
`cursor` is the opaque `created_at:id` value returned as `next_cursor`.

HTTP `200 OK` response:

```json
{
  "success": true,
  "invitations": [
    {
      "id": "invitation-uuid",
      "intended_email": "tester@example.com",
      "created_at": 1794268800,
      "expires_at": 1794873600,
      "redeemed_at": null,
      "revoked_at": null,
      "redeemed_by_user_id": null,
      "created_by_user_id": "owner-account-uuid",
      "notes": "Pre-alpha cohort",
      "status": "pending"
    }
  ],
  "next_cursor": null
}
```

`invitations` contains zero or more metadata objects exactly as defined above;
`next_cursor` is a string or `null`.

### Invitation status

`GET /v1/owner/invitations/:id` has no request body. HTTP `200 OK` response:

```json
{
  "success": true,
  "invitation": {
    "id": "invitation-uuid",
    "intended_email": "tester@example.com",
    "created_at": 1794268800,
    "expires_at": 1794873600,
    "redeemed_at": null,
    "revoked_at": null,
    "redeemed_by_user_id": null,
    "created_by_user_id": "owner-account-uuid",
    "notes": null,
    "status": "pending"
  }
}
```

### Invitation revocation

`POST /v1/owner/invitations/:id/revoke` has no request body. A pending
invitation is revoked idempotently and returns HTTP `200 OK` with the exact same
response shape as invitation status; `revoked_at` is set and `status` is
`revoked`. A redeemed invitation cannot be revoked through this endpoint and
returns HTTP `409 Conflict` with `INVITATION_ALREADY_REDEEMED`.

Exact successful response shape:

```json
{
  "success": true,
  "invitation": {
    "id": "invitation-uuid",
    "intended_email": "tester@example.com",
    "created_at": 1794268800,
    "expires_at": 1794873600,
    "redeemed_at": null,
    "revoked_at": 1794268900,
    "redeemed_by_user_id": null,
    "created_by_user_id": "owner-account-uuid",
    "notes": null,
    "status": "revoked"
  }
}
```

### Tester access revocation

`POST /v1/owner/testers/:userId/revoke` has no request body. HTTP `200 OK`:

```json
{
  "success": true,
  "user_id": "tester-account-uuid",
  "access": "revoked"
}
```

The HTTP request is `POST /v1/owner/testers/tester-account-uuid/revoke` with
no JSON body.

This only revokes the tester entitlement; it does not disable the account,
revoke its session cookies, or interfere with recovery/authentication routes.
The next `/v1/auth/me` and private hosting request see `prealpha_access:false`.

### Public token validation

`POST /v1/invitations/validate` request:

```json
{"token":"64-lowercase-hex-characters"}
```

HTTP `200 OK` response:

```json
{"success":true,"valid":true}
```

No invited address or invitation metadata is returned.

### Invitation redemption

`POST /v1/invitations/redeem` requires a verified signed-in account. For an
invitation bound during registration, the request body may be empty:

```json
{}
```

For a safely reopened original invite link, the body may instead contain:

```json
{"token":"64-lowercase-hex-characters"}
```

Both successful forms return HTTP `200 OK`:

```json
{"success":true,"access":"approved"}
```

The token form is bound to the authenticated account and normalized verified
email. A token can only be redeemed once. Repeating redemption for the same
already-approved account does not need the token; use `{}` after registration
binding. Any other account receives an already-redeemed or email-mismatch error.

### Invitation error protocol

All API errors use exactly this JSON structure; `message` is the fixed safe
message in the table:

```json
{
  "success": false,
  "error": "INVALID_INVITATION",
  "code": 6002,
  "message": "This invitation is invalid."
}
```

| Identifier | BBB code | HTTP status | Exact `message` | Conditions |
| --- | ---: | ---: | --- | --- |
| `INVITATION_REQUIRED` | 6001 | 403 | `A valid invitation is required to register.` | Registration lacks a valid-shaped invitation token. |
| `INVALID_INVITATION` | 6002 | 400 | `This invitation is invalid.` | Unknown/malformed token or no pending registration-bound invitation. |
| `INVITATION_EXPIRED` | 6003 | 410 | `This invitation has expired.` | Invitation expiration has passed. |
| `INVITATION_REVOKED` | 6004 | 410 | `This invitation is no longer available.` | Invitation was revoked before redemption. |
| `INVITATION_ALREADY_REDEEMED` | 6005 | 409 | `This invitation has already been used.` | Invitation was consumed or cannot be redeemed again. |
| `INVITATION_EMAIL_MISMATCH` | 6006 | 403 | `This invitation cannot be used with this account.` | Authenticated/registration email does not match the invite. |
| `PREALPHA_ACCESS_DENIED` | 6007 | 403 | `This account does not have pre-alpha access.` | Authenticated account lacks an active tester/owner entitlement. |

Other endpoint failures retain the general protocol: `UNAUTHORIZED` (401,
1002), `FORBIDDEN`/`ORIGIN_DENIED` (403, 1003), `INVALID_INPUT` (400, 1004),
`NOT_FOUND` (404, 1001), `EMAIL_VERIFICATION_REQUIRED` (403, 4001), and
`RATE_LIMITED` (429, 1006). These identifiers do not disclose the invited email
or token hash.

Only the existing database `role='owner'` is automatically allowed. Admin and
customer roles are not changed; approved testers are represented by a separate
active entitlement. Project listing/creation, private file management and
billing checkout check that entitlement on every request. Losing access affects
existing sessions immediately but does not disable login, logout, email
verification or password recovery. Public paid websites continue to be served
without a tester login. Owner invitation mutations require the exact dashboard
Origin and a verified owner session.

Limits persist in D1 across isolates: fixed 15-minute windows, 5 attempts per IP
for registration, verification and password recovery, 20 for login, and an
additional 5 per normalized email for login. Invitation validation permits 20 attempts per IP and invitation
redemption 10 per IP in the same window. Cloudflare supplies CF-Connecting-IP;
requests without it share a local bucket. Malformed attempts count too. Expired
rate rows are removed during auth writes. Consider edge rate limits and monitoring for
large distributed attacks; the D1 limiter is not a substitute for edge capacity
protection. Sessions expire in seven days without sliding refresh. Disabled users
cannot login, redeem tokens or use existing sessions. Logout is idempotent.

## Cloudflare Email Service

Registration sends verification to the stored account address. Repeat registrations
never replace passwords or roles, but can request another verification message
for an unverified, enabled account after a 15-minute recipient cooldown. Existing
IP limits remain in place. Forgot-password sends only to verified, enabled
accounts; all syntactically valid addresses receive the same 202 response, including
unknown/unverified/disabled accounts and provider failures. Delivery runs through
ExecutionContext.waitUntil so SMTP/provider timing does not affect responses.
Never interpret a 202 response as a delivered message or reveal eligibility in UI.

Emails use the native `EMAIL` binding, restricted to
`no-reply@mail.builtbybuzz.dev`, named **BuiltByBuzz Accounts**. No third-party
provider, API token or SMTP credentials are required. Structured HTML and text
parts are generated with fixed HTTPS links from trusted source configuration:

- `https://hosting.builtbybuzz.dev/verify-email#token=<token>`
- `https://hosting.builtbybuzz.dev/reset-password#token=<token>`

These two dashboard routes must be implemented separately before customers can
complete the flows; this repository does not change the dashboard. Each page must
read the token from the URL fragment, remove it using history.replaceState, keep it
only in memory, and submit JSON to the matching API endpoint after user confirmation.
The reset page also collects the new password. Do not auto-redeem on GET or link
previews. Use credentials:include, Content-Type:application/json, and the dashboard
Origin as for other auth calls. Show invalid/expired-link errors without showing
tokens; successful reset should take the customer to sign-in. Avoid third-party
scripts on token pages and set Referrer-Policy:no-referrer. Display generic recovery
acknowledgments. An unverified customer can repeat registration after the cooldown
using valid registration input to request verification again; no arbitrary email
sending or separate recipient endpoint exists. Login continues to permit unverified
accounts; email-verified privileges require a non-null email_verified_at.

Verification tokens expire after 24 hours, reset tokens after 30 minutes. Only
256-bit random token hashes are stored. Raw tokens and rendered messages exist
only in memory and in the provider submission; they are never stored in D1 or logs.
Reissuing a message invalidates earlier tokens for that purpose. Provider rejection
never verifies an account. Only successful verification redemption sets the timestamp.

### Delivery and retry behavior

Migration `0004_auth_email_jobs.sql` adds one durable job slot per user/purpose,
containing state, attempt counts, timestamps and provider message ID. It contains
no raw token, email body or provider error text. Enqueue uses the stored user ID
and address; client-selected redirects, recipients and sender fields are ignored.
Atomic job claims prevent concurrent sends. New requests are deduplicated for at
least 15 minutes per recipient/purpose across IPs and isolates.

The initial send runs in the background. A minutely Worker cron dispatches pending
and due retry jobs, at most 20 per invocation. Only an explicit
E_RATE_LIMIT_EXCEEDED rejection is retried, after 60 then 300 seconds, with at most
three total attempts. Rejected tokens are invalidated; the next attempt generates
a fresh token. Daily quota, validation, suppression, sender configuration and other
explicit permanent rejections are marked failed, with no automatic retry. Fix the
configuration/quota and request another email after the cooldown.

Unknown/network/internal failures are marked uncertain and are not automatically
replayed: the service may already have accepted the message. Interrupted sending
jobs become uncertain after ten minutes. Their tokens remain valid if the message
actually arrived. After the recipient cooldown, a user can explicitly request a new
message, which invalidates the earlier link. This bounds duplicates without claiming
exactly-once delivery across D1 and the external service. No encrypted/raw token
outbox secret is required. An interruption before enqueue commits may require the
user to request again. Pending jobs committed before an interruption are recovered
by the cron. A job becomes accepted and accepted_at/message_id are set only after
EMAIL.send returns a messageId; acceptance does not guarantee inbox delivery.
Provider bounce/suppression handling remains Cloudflare's responsibility.

Administrators can inspect state/attempt counts in auth_email_jobs using protected
D1 access without seeing any tokens. Review persistent failed/uncertain jobs and
Cloudflare Email Service metrics for operational failures; raw provider exceptions
are deliberately suppressed. Do not reset uncertain jobs for automated replay.
Apply a reviewed retention policy for accepted/failed job metadata; do not clear
recent slots, as they enforce cooldowns. There is no public job inspection endpoint.

Token hashes have unique indexes. D1 batch transactions claim an unused,
unexpired token using a random `consumed_by` marker and condition all changes on
that marker. Concurrent redemption has one winner. Reset changes the password,
revokes every session and invalidates other reset tokens atomically. Verification
only sets email_verified_at after successful possession proof. Schedule a reviewed
retention job for expired sessions/tokens; expiry checks do not depend on cleanup.

## Ownership, roles and future checkout

Existing projects.owner_id, api_tokens.owner_id and stripe_customers.owner_id are
text values and remain intact. No foreign key from legacy ownership to users is
introduced. No matching by name/email and no automatic claiming is performed.
Future project creation must derive owner_id from `sessionUser(request, env).id`;
never trust supplied owner IDs. Link legacy assets only after an independently
verified administrative ownership process and reconcile Stripe mappings explicitly.

Customer session cookies do not authorize the current checkout endpoint. It still
requires its existing administrator-issued bearer token and exact project ownership.
Customer/admin/owner user roles do not impersonate these credentials. For future
session checkout: validate Origin, resolve an active session, require verified email,
select the requested project by both project ID and session user ID, and derive
Stripe owner/customer metadata from that trusted result. Reuse the existing price,
reservation/idempotency and webhook logic. Never accept a price or owner from the
browser. Each subscription remains tied to one website through project_id; preserve
that relationship when reconciling legacy data.

A trusted database administrator can promote a verified, enabled account after
independently verifying the account ID and authorization. There is no public role
mutation API. Store this reviewed SQL in a private file, replacing placeholders:

```sql
UPDATE users SET role='admin', updated_at=unixepoch()
WHERE id='<verified-user-uuid>' AND email_verified_at IS NOT NULL AND disabled_at IS NULL;
UPDATE user_sessions SET revoked_at=unixepoch() WHERE user_id='<verified-user-uuid>';
```

Use role='owner' only with explicit organizational owner approval. Check exactly
one account was updated, record operator/time/reason in your administrative audit
process, and independently inspect the resulting trusted row. Run via the protected
Cloudflare administrative account using a private SQL file. Apply the SQL file through `npx wrangler d1 execute DB --remote --file <private-file.sql>`
only after review; D1 executes the file transactionally.
Demotion/disabling follows the same controlled process. Future authorization must
read roles from the database, never client fields or a hardcoded owner's email.

## GitHub repository synchronization (v0.1)

All endpoints below require the signed-in, verified project owner, active
pre-alpha access, and `credentials: 'include'`. Project IDs are resolved with
both `project_id` and the session user's ID; another user's project returns
`404 PROJECT_NOT_FOUND`. Write requests require the exact Origin
`https://hosting.builtbybuzz.dev`. Requests and responses use JSON and
`Cache-Control: no-store`.

Only public GitHub repositories and static website files are supported. The API
does not accept GitHub credentials, private repositories, build commands, or
package installation. Repository URLs must be HTTPS URLs on exactly
`github.com` in the form `https://github.com/{owner}/{repository}` (optional
`.git` suffix accepted). GitHub API calls go only to `api.github.com`; redirects
are rejected.

### Read connection and status

```http
GET /v1/projects/{project_id}/github
```

```json
{
  "success": true,
  "github": {
    "connected": true,
    "repository": "https://github.com/acme/portfolio",
    "branch": "main",
    "source_folder": "website",
    "daily_sync": false,
    "status": "success",
    "last_deployed_commit": "0123456789abcdef0123456789abcdef01234567",
    "last_check_at": 1794412800,
    "last_success_at": 1794412800,
    "failure_reason": null
  }
}
```

Timestamps are Unix seconds or `null`. `status` is `disconnected`, `connected`,
`syncing`, `success`, `unchanged`, `failed`, or `conflict`. Failure reasons are
safe internal identifiers (for example `GITHUB_REQUEST_FAILED`,
`REPOSITORY_TOO_LARGE`, `SYNC_CONFLICT`, or `STORAGE_QUOTA_EXCEEDED`), never
upstream response bodies.

### Connect or update

```http
PUT /v1/projects/{project_id}/github
Content-Type: application/json

{
  "repository_url": "https://github.com/acme/portfolio",
  "branch": "main",
  "source_folder": "website",
  "daily_sync": false
}
```

`repository_url` is required. `branch`, `source_folder`, and `daily_sync` are
optional; the default branch, repository root, and `false` are used respectively.
The branch is resolved against GitHub before saving. `source_folder` is a
repository-relative folder without leading or trailing slashes. Updating an
existing connection may keep the same repository but cannot replace it directly:
`DELETE` the connection first. A successful response uses the same
`github` object as the read endpoint.

### Trigger an immediate check and deployment

```http
POST /v1/projects/{project_id}/github/sync
```

Successful responses have `sync.status` equal to `success` or `unchanged` and
include `deployed_commit`, `last_check_at`, and `last_success_at`. A deployed
commit SHA match skips tree/file retrieval and leaves the deployed version
unchanged. Manual attempts are limited to three per user per minute; overlapping
project writes/syncs return `409 PROJECT_BUSY`.

Supported paths must pass the same project-file path and content-type validation
as editor uploads. Git metadata, symlinks, submodules, credentials, environment
files, private keys, and non-publishable file types are ignored. One sync accepts
at most 50 publishable files, each no larger than 25 MiB, and the complete live
site remains subject to the existing 10,000-file and 1 GiB storage quotas.

The worker stages a complete next generation in R2 and switches the live prefix
only after every selected file is downloaded and validated. An interrupted or
failed import therefore leaves the previous generation active. Existing editor
files are copied forward. Repository-deleted files are retained rather than
silently deleted. An editor-modified, repository-managed file is preserved if
the repository still has the same blob; if both sides changed, sync returns
`409 GITHUB_SYNC_CONFLICT` without activation. A newly imported file that would
collide with an editor-only file also conflicts.

To resolve a path conflict, preserve any local edit under another path, then
delete the conflicting managed file with the existing project file `DELETE`
endpoint and retry sync. Deleting a tracked file removes its sync tracking entry,
so the next sync can restore the repository version. To keep it deleted, remove
it from the repository too. Disconnecting never deletes deployed site files;
it disables future GitHub checks and leaves the current active generation
editable and live.

Errors use the standard BBB JSON envelope and retain their HTTP status:
`400 GITHUB_REPOSITORY_INVALID`/`INVALID_INPUT`, `401 UNAUTHORIZED`,
`403 FORBIDDEN`/`ORIGIN_DENIED`/`EMAIL_VERIFICATION_REQUIRED`,
`404 PROJECT_NOT_FOUND`, `409 PROJECT_BUSY`/`GITHUB_NOT_CONNECTED`/
`GITHUB_SYNC_CONFLICT`, `413 GITHUB_REPOSITORY_TOO_LARGE`, `429 RATE_LIMITED`,
`502 GITHUB_SYNC_FAILED`, and `507 STORAGE_LIMIT_EXCEEDED`. These map to the
existing BBB codes for invalid input (1004), forbidden (1003), conflict (1005),
file too large (2004), rate limited (1006), service unavailable (1007), and
storage quota exceeded (2003).

Every API error also includes the backend-generated `reference` and the
`incidentRecorded` boolean. Keep and display the supplied reference when
reporting an error; do not generate a second dashboard reference. When
`incidentRecorded` is `false`, the Worker could not persist the incident (or
its write budget was exhausted), so the reference is available only in safe
Worker logs and is not searchable in D1. See
[`error-protocol.md`](./error-protocol.md) for registry categories and the
complete response contract.

### Disconnect

```http
DELETE /v1/projects/{project_id}/github
```

Returns the disconnected `github` status object. Deployed files and the active
generation remain in place. A later connection to a different repository is
allowed only after disconnecting; existing paths are still protected from
overwrites and may need to be removed or renamed in the editor before syncing.

### Optional daily checks

Set `daily_sync: true` on `PUT` to opt in. The existing minutely Cloudflare
scheduled handler checks each enabled project at most once per 24 hours, also
updating `last_check_at` for failures and unchanged commits. The default is off.
The daily check is a deployment check, not a build: only static repository files
are published. Apply the additive `0008_github_sync.sql` migration through the
normal reviewed migration process before enabling these routes; it is not
applied automatically by this API.
