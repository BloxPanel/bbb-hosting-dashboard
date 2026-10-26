# BuiltByBuzz Hosting Dashboard

A React + TypeScript + Vite customer hosting console, built independently of `builtbybuzz` and `bbb-hosting-api`. Dark responsive UI with React Router, Tailwind CSS and Lucide icons.

## Local development

Requires Node.js 22+ and npm.

```sh
npm ci
cp .env.example .env.local
```

Set `VITE_DEMO_MODE=true` in `.env.local`, then run `npm run dev` and open the printed URL. On the login page choose **Enter demo workspace**. Demo mode is off by default and requires both Vite development mode and the explicit flag. All displayed demo accounts, example.com addresses, subscriptions and deployments are fictional. Local website/profile/file/domain changes survive page navigation in memory and reset on refresh. Uploads read browser-local files (5 MB per file), never R2. Billing controls never simulate a successful payment or activation.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Browser verification:

```sh
npx playwright install --with-deps chromium
npm run test:e2e
```

The browser suite starts and stops its own development and production-preview servers. It exercises desktop/mobile routes, local website CRUD, file upload and preview, billing isolation, responsive overflow, drawer keyboard behavior, and production demo rejection (including a production build with the demo flag set).

Production builds disable demo authentication regardless of `VITE_DEMO_MODE`. Production uses the BBB API cookie session for registration, login, verification and recovery. Website, file, deployment and billing operations remain disabled until their separate contracts are connected. See [the integration contract](docs/API_INTEGRATION.md).

## Included pages

`/login`, `/register` (`/signup` alias), `/verify-email`, `/forgot-password`, `/reset-password`, `/dashboard`, `/dashboard/sites`, and `/dashboard/sites/:siteId` with `files`, `domains`, `deployments`, `billing`, and `settings` subroutes. Account billing, account settings and support are under `/dashboard/billing`, `/dashboard/account`, and `/dashboard/support`. Protected routes require a session; a production build cannot enter through demo login.

The file manager supports directory navigation, local upload/drop/progress, text/image previews, download, rename and confirmed recursive deletion. Website management supports search, publication/billing filters, local draft creation, rename and confirmed deletion with active subscription warnings.

**One paid annual subscription = one hosted website.** Billing status, publication status and entitlement are separate types. Active annual base cost is $10 multiplied by active site subscriptions. Domain aliases do not add projects. Owner grants must come from the backend.

## Architecture

- `src/app`: session/demo state and protected routes
- `src/components`: shared layout, dialogs, badges, empty/loading states
- `src/pages`: account and per-website screens
- `src/services`: fail-closed centralized API client, typed capability adapters and demo fixtures
- `src/types`: account, website, billing, files, domains and deployment interfaces
- `src/styles`: shared BBB design system and responsive rules

The API client permits only confirmed endpoints at `https://api.builtbybuzz.dev` and rejects alternate origins or missing configuration. Authentication uses `credentials: "include"` with the API's HTTP-only `__Host-bbb_session` cookie; JavaScript never reads or stores that cookie. Other diagnostics retain anonymous requests. Checkout still requires its separate confirmed bearer flow and remains disabled in the UI.

At startup, `/v1/auth/me` restores the account. Guards wait for initialization and preserve internal dashboard destinations. Login and logout update memory state; unauthorized session responses clear account data. Registration and recovery show generic acknowledgments. Password creation requires at least 12 Unicode characters and at most 1,024 UTF-8 bytes, with confirmation.

Verification/reset links use `#token=...`. Bootstrap captures the fragment and immediately strips it with `replaceState`. Tokens remain in memory, require user submission, clear after success, and disappear on refresh. Token pages contain no third-party scripts or connectivity panel. The HTML sets a global `no-referrer` meta policy (including the generated Pages fallback); GitHub Pages cannot configure a route-specific HTTP response header from this repository. If a literal `Referrer-Policy` header is required, the hosting layer must supply it. CSP has not been weakened.

Development demo mode never sends authentication requests and cannot mix real accounts with demo fixtures. Turn the demo flag off to test real authentication locally; the backend must explicitly allow the development origin. No credentials or tokens are persisted in browser storage. Profile editing remains disabled in production because no update endpoint is supplied.

## GitHub Pages deployment

The public URL is **https://hosting.builtbybuzz.dev**. No deployment has been performed. The workflow in [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) runs **only when manually dispatched**, and only from `main`. Committing or pushing it does not deploy. It uses Node.js 22, `npm ci`, type-checking, lint, unit tests, and `npm run build`, then uploads only `dist/` and deploys that artifact through the `github-pages` environment.

Manual repository setup (when ready to publish):

1. Commit the dashboard source, lockfile, and workflow to `main`.
2. Under **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. Ensure repository Actions settings allow the `actions/*` actions used by the workflow.
3. Under **Settings → Pages → Custom domain**, enter `hosting.builtbybuzz.dev` and save. `public/CNAME` records the intended domain in the built artifact, but GitHub ignores CNAME files for custom Actions deployments; the repository setting is required. See [GitHub's custom-domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
4. Under **Settings → Environments → github-pages**, allow deployments from `main`; add required reviewers if desired. The workflow itself rejects other branches.
5. When publication is authorized, select **Actions → Deploy dashboard to GitHub Pages → Run workflow → main**. This is the step that deploys. No PAT, backend credentials, or custom deployment secret is required; GitHub supplies its scoped token and OIDC identity.
6. Enable **Enforce HTTPS** in Settings → Pages when GitHub makes it available. Domain verification and certificate issuance depend on the domain already resolving appropriately. DNS and Cloudflare Worker routes are outside this change and must be handled separately by their owner if necessary.
7. Verify `/signup` and a nested route such as `/dashboard/sites/site_001/files` by direct navigation and browser refresh. The public sign-up screen should render; protected routes should retain their existing authentication behavior and redirect unauthenticated users to `/login`.

Vite uses `base: "/"` for this root-domain deployment. Every production build emits `dist/404.html` from the generated `index.html`. GitHub Pages serves that document for missing paths, so BrowserRouter receives the original path, query string and hash without a redirect encoding scheme or hash routes. Assets use root-relative URLs. GitHub Pages still returns HTTP **404** for these initial deep-link requests; the app then renders normally (or applies its existing auth guard). This status is a static-hosting limitation relevant to crawlers. `public/_redirects` remains for other compatible hosts; GitHub Pages does not use it.

The workflow explicitly sets `VITE_API_BASE_URL=https://api.builtbybuzz.dev` and `VITE_DEMO_MODE=false`; `.env.production` provides the same defaults for local production builds. All `VITE_*` values are public browser configuration. Never add backend credentials, Stripe secret keys or administrative bearer tokens to them, the source, or `public/`. The workflow uploads only the built site. Existing demo mode remains available only in development, and the remaining resource integration limitations described above remain in effect. This setup does not modify `bbb-hosting-api`, Cloudflare DNS, or Worker routes.

## Verification

Unit tests cover explicit development demo gating, unknown API rejection, independent site billing, annual totals and separate publication state. Build/lint/typecheck validate the full source. Playwright checks cover desktop/mobile navigation and website mutations, file upload/preview persistence, dialog Escape, mobile drawer keyboard behavior, responsive overflow and production demo denial. Backend integration requires the staging acceptance checks in the contract.
