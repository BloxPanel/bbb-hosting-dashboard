export const demoEnabled = (development: boolean, value: string | undefined) =>
  development && value === "true";
export const DEMO = demoEnabled(
  import.meta.env.DEV,
  import.meta.env.VITE_DEMO_MODE,
);

const REQUIRED_API_ORIGIN = "https://api.builtbybuzz.dev";
export function resolveApiBaseUrl(value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(
      "API configuration is missing. Set VITE_API_BASE_URL=https://api.builtbybuzz.dev and restart or rebuild the dashboard.",
    );
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("VITE_API_BASE_URL must be https://api.builtbybuzz.dev.");
  }
  if (
    url.origin !== REQUIRED_API_ORIGIN ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "VITE_API_BASE_URL must be https://api.builtbybuzz.dev, with no path, credentials, query, or fragment.",
    );
  }
  return url.origin;
}

type ConfirmedRoute = Readonly<{
  path: string;
  method: "GET" | "POST";
  bearer?: boolean;
  session?: boolean;
}>;
// Only confirmed browser-callable endpoints. Stripe's webhook is deliberately excluded.
export const routes: Readonly<Record<string, ConfirmedRoute>> = Object.freeze({
  "auth.session": Object.freeze({
    path: "/v1/auth/me",
    method: "GET",
    session: true,
  }),
  "auth.login": Object.freeze({
    path: "/v1/auth/login",
    method: "POST",
    session: true,
  }),
  "auth.register": Object.freeze({
    path: "/v1/auth/register",
    method: "POST",
    session: true,
  }),
  "auth.logout": Object.freeze({
    path: "/v1/auth/logout",
    method: "POST",
    session: true,
  }),
  "auth.verify": Object.freeze({
    path: "/v1/auth/verify-email",
    method: "POST",
    session: true,
  }),
  "auth.forgot": Object.freeze({
    path: "/v1/auth/forgot-password",
    method: "POST",
    session: true,
  }),
  "auth.reset": Object.freeze({
    path: "/v1/auth/reset-password",
    method: "POST",
    session: true,
  }),
  "projects.list": Object.freeze({
    path: "/v1/projects",
    method: "GET",
    session: true,
  }),
  "api.info": Object.freeze({ path: "/", method: "GET" }),
  "api.health": Object.freeze({ path: "/v1/health", method: "GET" }),
  "api.projectCount": Object.freeze({
    path: "/v1/dev/project-count",
    method: "GET",
  }),
  "billing.checkout": Object.freeze({
    path: "/api/billing/checkout",
    method: "POST",
    bearer: true,
  }),
});
export class IntegrationUnavailable extends Error {
  constructor() {
    super(
      "This action is unavailable until the backend API contract is connected.",
    );
  }
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(
      (
        {
          INVALID_INPUT: "Please check the information you entered.",
          INVALID_TOKEN:
            "This link is invalid, expired, or already used. Request a new link.",
          INVALID_CREDENTIALS: "Email or password is incorrect.",
          UNAUTHORIZED: "Your session has expired. Please sign in again.",
          ORIGIN_DENIED: "Sign-in is not available from this address.",
          RATE_LIMITED: "Too many attempts. Please wait before trying again.",
          AUTH_UNAVAILABLE:
            "Authentication is temporarily unavailable. Please try again later.",
        } as Record<string, string>
      )[code] ||
        (status === 429
          ? "Too many attempts. Please try again later."
          : "The service could not complete your request. Please try again."),
    );
  }
}
export interface ApiRequestOptions extends Omit<
  RequestInit,
  "credentials" | "redirect"
> {
  /** Short-lived token supplied by a future verified auth integration; never persisted. */
  bearerToken?: string;
}
export async function api<T = unknown>(
  capability: string,
  init: ApiRequestOptions = {},
): Promise<T> {
  const base = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (!Object.hasOwn(routes, capability)) throw new IntegrationUnavailable();
  const route = routes[capability];
  if (DEMO && route.session)
    throw new Error(
      "Real authentication is disabled in development demo mode.",
    );
  if (init.method && init.method.toUpperCase() !== route.method) {
    throw new Error(
      "The request method does not match the confirmed API contract.",
    );
  }
  const { bearerToken, ...request } = init;
  if (route.bearer && !bearerToken?.trim()) {
    throw new Error(
      "Checkout requires an authenticated bearer token. Sign-in integration is not connected yet.",
    );
  }
  const headers = new Headers(request.headers);
  if (headers.has("Authorization"))
    throw new Error("Supply authentication through the bearerToken option.");
  if (headers.has("Origin"))
    throw new Error("The browser supplies Origin automatically.");
  if (route.session && route.method === "POST")
    headers.set("Content-Type", "application/json");
  if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
  if (typeof request.body === "string" && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(new URL(route.path, base), {
      ...request,
      method: route.method,
      credentials: route.session ? "include" : "omit",
      redirect: "error",
      headers,
    });
  } catch {
    throw new Error(
      "Cannot reach the BuiltByBuzz API. Check your connection and the API's CORS policy for this dashboard origin.",
    );
  }
  if (!response.ok) {
    let code = "";
    try {
      const error = await response.json();
      code =
        error.error?.code ||
        error.code ||
        (typeof error.error === "string" ? error.error : "");
    } catch {
      /* Never expose raw server errors. */
    }
    if (
      route.session &&
      response.status === 401 &&
      capability !== "auth.login" &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(new Event("bbb-session-expired"));
    throw new ApiError(
      response.status,
      code || (response.status === 401 ? "UNAUTHORIZED" : ""),
    );
  }
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  if (response.headers.get("Content-Type")?.includes("json")) {
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error("The API returned an invalid JSON response.");
    }
  }
  return body as T;
}
