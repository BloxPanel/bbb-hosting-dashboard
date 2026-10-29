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
  path: string | ((params: string[]) => string);
  method: "GET" | "POST" | "PUT" | "DELETE";
  bearer?: boolean;
  session?: boolean;
}>;
function projectFilesPath(projectId: string, filePath?: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId))
    throw new Error("The project ID is invalid.");
  const projectPath = `/v1/projects/${encodeURIComponent(projectId)}/files`;
  if (filePath === undefined) return projectPath;
  if (
    !filePath ||
    filePath.length > 1024 ||
    filePath.includes("\\") ||
    filePath.includes("%") ||
    Array.from(filePath).some(
      (character) =>
        character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127,
    ) ||
    filePath.normalize("NFC") !== filePath ||
    filePath.split("/").some(
      (segment) =>
        !segment ||
        segment.length > 255 ||
        segment === "." ||
        segment === ".." ||
        segment.includes(".."),
    )
  )
    throw new Error("The file path is invalid.");
  return `${projectPath}/${filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}
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
  "projects.create": Object.freeze({
    path: "/v1/projects",
    method: "POST",
    session: true,
  }),
  "files.list": Object.freeze({
    path: (params: string[]) => {
      const query = new URLSearchParams({ limit: params[1] || "100" });
      if (params[2]) query.set("cursor", params[2]);
      return `${projectFilesPath(params[0])}?${query}`;
    },
    method: "GET",
    session: true,
  }),
  "files.upload": Object.freeze({
    path: (params: string[]) =>
      `${projectFilesPath(params[0])}?${new URLSearchParams({ path: params[1] })}`,
    method: "POST",
    session: true,
  }),
  "files.download": Object.freeze({
    path: (params: string[]) => projectFilesPath(params[0], params[1]),
    method: "GET",
    session: true,
  }),
  "files.replace": Object.freeze({
    path: (params: string[]) => projectFilesPath(params[0], params[1]),
    method: "PUT",
    session: true,
  }),
  "files.delete": Object.freeze({
    path: (params: string[]) => projectFilesPath(params[0], params[1]),
    method: "DELETE",
    session: true,
  }),
  "files.storage": Object.freeze({
    path: (params: string[]) => {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(params[0]))
        throw new Error("The project ID is invalid.");
      return `/v1/projects/${encodeURIComponent(params[0])}/storage`;
    },
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
    const codeMessages: Record<string, string> = {
      INVALID_INPUT: "Please check the information you entered.",
      INVALID_TOKEN:
        "This link is invalid, expired, or already used. Request a new link.",
      INVALID_CREDENTIALS: "Email or password is incorrect.",
      UNAUTHORIZED: "Your session has expired. Please sign in again.",
      ORIGIN_DENIED: "This action is not allowed from this dashboard address.",
      RATE_LIMITED: "Too many attempts. Please wait before trying again.",
      AUTH_UNAVAILABLE:
        "Authentication is temporarily unavailable. Please try again later.",
      INVALID_PATH:
        "That file path is not allowed. Use a simple name and supported folder path.",
      UNSUPPORTED_FILE_TYPE:
        "This file type is not supported. Choose an allowed website file type.",
      CONTENT_LENGTH_REQUIRED:
        "The API rejected this upload because it did not receive a file size. The browser cannot set Content-Length manually; please try another supported browser or contact support.",
      INVALID_UPLOAD:
        "The API could not verify the complete file upload. Please try uploading the file again.",
      FILE_TOO_LARGE: "Files must be 25 MiB or smaller.",
      STORAGE_LIMIT_EXCEEDED:
        "This upload would exceed the website's 1 GiB storage limit.",
      FILE_COUNT_LIMIT_EXCEEDED:
        "This website has reached its 10,000-file limit.",
      FILE_ALREADY_EXISTS:
        "A file with that name already exists. Choose Replace to overwrite it.",
      FILE_NOT_FOUND: "That file no longer exists. Refresh the file list.",
      PROJECT_BUSY: "Another file change is in progress. Please try again.",
      EMAIL_VERIFICATION_REQUIRED:
        "Please verify your email address before continuing.",
      EMAIL_NOT_VERIFIED:
        "Please verify your email address before creating a website.",
      EMAIL_UNVERIFIED:
        "Please verify your email address before creating a website.",
      DUPLICATE_SLUG: "That subdomain is already in use. Try another one.",
      DUPLICATE_SUBDOMAIN:
        "That subdomain is already in use. Try another one.",
      RESERVED_SLUG: "That subdomain is reserved. Choose a different one.",
      RESERVED_SUBDOMAIN:
        "That subdomain is reserved. Choose a different one.",
      SLUG_TAKEN: "That subdomain is already in use. Try another one.",
      SLUG_ALREADY_EXISTS:
        "That subdomain is already in use. Try another one.",
      SUBDOMAIN_TAKEN: "That subdomain is already in use. Try another one.",
      PROJECT_SLUG_TAKEN:
        "That subdomain is already in use. Try another one.",
    };
    const normalizedCode = code.toUpperCase();
    super(
      codeMessages[normalizedCode] ||
        (status === 401
          ? "Your session has expired. Please sign in again."
          : status === 400
            ? "Please check the information you entered."
            : status === 403
              ? "You do not have permission to complete this request."
          : status === 429
            ? "Too many attempts. Please try again later."
            : status >= 500
              ? "The service is temporarily unavailable. Please try again later."
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
  pathParams: string[] = [],
): Promise<T> {
  const base = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (!Object.hasOwn(routes, capability)) throw new IntegrationUnavailable();
  const route = routes[capability];
  if (typeof route.path === "function" && pathParams.length === 0)
    throw new Error("This API request is missing its required path parameters.");
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
  const routePath =
    typeof route.path === "string" ? route.path : route.path(pathParams);
  const url = new URL(routePath, base);
  if (headers.has("Authorization"))
    throw new Error("Supply authentication through the bearerToken option.");
  if (headers.has("Origin"))
    throw new Error("The browser supplies Origin automatically.");
  if (route.session && route.method === "POST" && capability !== "files.upload")
    headers.set("Content-Type", "application/json");
  if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
  if (typeof request.body === "string" && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(url, {
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

export async function apiBlob(
  capability: "files.download",
  pathParams: string[],
): Promise<{ blob: Blob; contentType: string }> {
  const base = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (!Object.hasOwn(routes, capability)) throw new IntegrationUnavailable();
  const route = routes[capability];
  if (route.method !== "GET")
    throw new Error("Binary downloads require a confirmed GET endpoint.");
  if (DEMO && route.session)
    throw new Error(
      "Real authentication is disabled in development demo mode.",
    );
  const path =
    typeof route.path === "string" ? route.path : route.path(pathParams);
  let response: Response;
  try {
    response = await fetch(new URL(path, base), {
      method: route.method,
      credentials: route.session ? "include" : "omit",
      redirect: "error",
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
      typeof window !== "undefined"
    )
      window.dispatchEvent(new Event("bbb-session-expired"));
    throw new ApiError(
      response.status,
      code || (response.status === 401 ? "UNAUTHORIZED" : ""),
    );
  }
  return {
    blob: await response.blob(),
    contentType: response.headers.get("Content-Type") || "application/octet-stream",
  };
}

export function apiUpload(
  capability: "files.upload" | "files.replace",
  pathParams: string[],
  file: File,
  onProgress: (progress: number) => void,
): Promise<unknown> {
  const base = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (!Object.hasOwn(routes, capability)) throw new IntegrationUnavailable();
  const route = routes[capability];
  if (DEMO) {
    return Promise.reject(
      new Error("Real file uploads are disabled in development demo mode."),
    );
  }
  const path =
    typeof route.path === "string" ? route.path : route.path(pathParams);
  const expectedUrl = new URL(path, base);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(route.method, expectedUrl);
    request.withCredentials = true;
    request.responseType = "text";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(
        new Error(
          "Cannot reach the BuiltByBuzz API. Check your connection and the API's CORS policy for this dashboard origin.",
        ),
      );
    request.onload = () => {
      let responseUrl: URL;
      try {
        responseUrl = new URL(request.responseURL);
      } catch {
        reject(new Error("The API returned an invalid upload response URL."));
        return;
      }
      if (
        responseUrl.origin !== base ||
        responseUrl.pathname !== expectedUrl.pathname ||
        responseUrl.search !== expectedUrl.search
      ) {
        reject(new Error("The API redirected this upload unexpectedly."));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        let code = "";
        try {
          const error = JSON.parse(request.responseText);
          code =
            error.error?.code ||
            error.code ||
            (typeof error.error === "string" ? error.error : "");
        } catch {
          /* Never expose raw server errors. */
        }
        if (
          route.session &&
          request.status === 401 &&
          typeof window !== "undefined"
        )
          window.dispatchEvent(new Event("bbb-session-expired"));
        reject(
          new ApiError(
            request.status,
            code || (request.status === 401 ? "UNAUTHORIZED" : ""),
          ),
        );
        return;
      }
      try {
        resolve(request.responseText ? JSON.parse(request.responseText) : null);
      } catch {
        reject(new Error("The API returned an invalid JSON response."));
      }
    };
    request.send(file);
  });
}
