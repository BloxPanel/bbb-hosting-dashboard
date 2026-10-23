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
}>;
// Only confirmed browser-callable endpoints. Stripe's webhook is deliberately excluded.
export const routes: Readonly<Record<string, ConfirmedRoute>> = Object.freeze({
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
  if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
  if (typeof request.body === "string" && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(new URL(route.path, base), {
      ...request,
      method: route.method,
      credentials: "omit",
      redirect: "error",
      headers,
    });
  } catch {
    throw new Error(
      "Cannot reach the BuiltByBuzz API. Check your connection and the API's CORS policy for this dashboard origin.",
    );
  }
  if (!response.ok)
    throw new Error(
      `BuiltByBuzz API request failed (${response.status}). Please try again.`,
    );
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
