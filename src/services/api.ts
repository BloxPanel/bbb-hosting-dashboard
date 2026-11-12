import {
  formatErrorReport,
  createDiagnosticError,
  normalizeError,
  parseBackendError,
  type NormalizedError,
} from "./errors";

export * from "./errors";

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
  noStore?: boolean;
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
function projectGithubPath(params: string[]): string {
  const [projectId] = params;
  if (!projectId || !/^[A-Za-z0-9_-]{1,128}$/.test(projectId))
    throw new Error("The project ID is invalid.");
  return `/v1/projects/${encodeURIComponent(projectId)}/github`;
}
function ownerInvitationsPath(params: string[]): string {
  const [id] = params;
  if (!id) return "/v1/owner/invitations";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
    throw new Error("The invitation ID is invalid.");
  return `/v1/owner/invitations/${encodeURIComponent(id)}`;
}
function ownerTesterPath(params: string[]): string {
  const [userId] = params;
  if (!userId || !/^[A-Za-z0-9_-]{1,128}$/.test(userId))
    throw new Error("The account ID is invalid.");
  return `/v1/owner/testers/${encodeURIComponent(userId)}/revoke`;
}
// Only confirmed browser-callable endpoints. Stripe's webhook is deliberately excluded.
export const routes: Readonly<Record<string, ConfirmedRoute>> = Object.freeze({
  "auth.session": Object.freeze({
    path: "/v1/auth/me",
    method: "GET",
    session: true,
    noStore: true,
  }),
  "auth.login": Object.freeze({
    path: "/v1/auth/login",
    method: "POST",
    session: true,
    noStore: true,
  }),
  "auth.register": Object.freeze({
    path: "/v1/auth/register",
    method: "POST",
    session: true,
    noStore: true,
  }),
  "auth.logout": Object.freeze({
    path: "/v1/auth/logout",
    method: "POST",
    session: true,
    noStore: true,
  }),
  "auth.verify": Object.freeze({
    path: "/v1/auth/verify-email",
    method: "POST",
    session: true,
    noStore: true,
  }),
  "auth.forgot": Object.freeze({
    path: "/v1/auth/forgot-password",
    method: "POST",
    session: true,
    noStore: true,
  }),
  "auth.reset": Object.freeze({
    path: "/v1/auth/reset-password",
    method: "POST",
    session: true,
    noStore: true,
  }),
  "invitations.validate": Object.freeze({
    path: "/v1/invitations/validate",
    method: "POST",
    session: true,
    noStore: true,
  }),
  "invitations.redeem": Object.freeze({
    path: "/v1/invitations/redeem",
    method: "POST",
    session: true,
    noStore: true,
  }),
  "owner.invitations.list": Object.freeze({
    path: (params: string[]) => {
      const query = new URLSearchParams();
      if (params[0]) query.set("limit", params[0]);
      if (params[1]) query.set("cursor", params[1]);
      const suffix = query.toString();
      return `/v1/owner/invitations${suffix ? `?${suffix}` : ""}`;
    },
    method: "GET",
    session: true,
    noStore: true,
  }),
  "owner.invitations.create": Object.freeze({
    path: "/v1/owner/invitations",
    method: "POST",
    session: true,
    noStore: true,
  }),
  "owner.invitations.status": Object.freeze({
    path: ownerInvitationsPath,
    method: "GET",
    session: true,
    noStore: true,
  }),
  "owner.invitations.revoke": Object.freeze({
    path: (params: string[]) => `${ownerInvitationsPath(params)}/revoke`,
    method: "POST",
    session: true,
    noStore: true,
  }),
  "owner.testers.revoke": Object.freeze({
    path: ownerTesterPath,
    method: "POST",
    session: true,
    noStore: true,
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
  "github.status": Object.freeze({
    path: projectGithubPath,
    method: "GET",
    session: true,
    noStore: true,
  }),
  "github.connect": Object.freeze({
    path: projectGithubPath,
    method: "PUT",
    session: true,
    noStore: true,
  }),
  "github.sync": Object.freeze({
    path: (params: string[]) => `${projectGithubPath(params)}/sync`,
    method: "POST",
    session: true,
    noStore: true,
  }),
  "github.disconnect": Object.freeze({
    path: projectGithubPath,
    method: "DELETE",
    session: true,
    noStore: true,
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
  public readonly bbbCode: number;
  public readonly identifier: string;
  public readonly httpStatus?: number;
  public readonly operation?: string;
  public readonly component?: string;
  public readonly reason?: string;
  public readonly field?: string;
  public readonly timestamp: string;
  public readonly reference: string;
  public readonly referenceSource: "backend" | "client";
  public readonly incidentRecorded?: boolean;
  public readonly retryable: boolean;

  constructor(
    public status: number,
    public code: string,
    details: Partial<NormalizedError> & {
      backendCode?: number;
      safeMessage?: string;
      identifier?: string;
    } = {},
  ) {
    const normalized = normalizeError(
      {
        status,
        code,
        identifier: details.identifier,
        bbbCode: details.backendCode,
        reference: details.reference,
        incidentRecorded: details.incidentRecorded,
      },
      {
        status,
        identifier: details.identifier ?? (code || undefined),
        backendCode: details.backendCode,
        reference: details.reference,
        incidentRecorded: details.incidentRecorded,
        operation: details.operation,
        component: details.component,
        field: details.field,
        reason: details.reason,
        message: details.safeMessage,
        retryable: details.retryable,
      },
    );

    const legacyMessage =
      code.toUpperCase() === "INVALID_INPUT"
        ? "Please check the information you entered."
        : code.toUpperCase() === "INVALID_TOKEN"
          ? "This link is invalid, expired, or already used. Request a new link."
          : code.toUpperCase() === "INVALID_CREDENTIALS"
            ? "Email or password is incorrect."
            : code.toUpperCase() === "UNAUTHORIZED"
              ? "Your session has expired. Please sign in again."
              : code.toUpperCase() === "ORIGIN_DENIED"
                ? "This action is not allowed from this dashboard address."
                : code.toUpperCase() === "RATE_LIMITED"
                  ? "Too many attempts. Please try again later."
                  : code.toUpperCase() === "AUTH_UNAVAILABLE"
                    ? "Authentication is temporarily unavailable. Please try again later."
                    : code.toUpperCase() === "INVALID_PATH"
                      ? "That file path is not allowed. Use a simple name and supported folder path."
                      : code.toUpperCase() === "UNSUPPORTED_FILE_TYPE"
                        ? "This file type is not supported. Choose an allowed website file type."
                        : code.toUpperCase() === "CONTENT_LENGTH_REQUIRED"
                          ? "The API rejected this upload because it did not receive a file size. The browser cannot set Content-Length manually; please try another supported browser or contact support."
                          : code.toUpperCase() === "INVALID_UPLOAD"
                            ? "The API could not verify the complete file upload. Please try uploading the file again."
                            : code.toUpperCase() === "FILE_TOO_LARGE"
                              ? "Files must be 25 MiB or smaller."
                              : code.toUpperCase() === "STORAGE_LIMIT_EXCEEDED"
                                ? "This upload would exceed the website's 1 GiB storage limit."
                                : code.toUpperCase() === "FILE_COUNT_LIMIT_EXCEEDED"
                                  ? "This website has reached its 10,000-file limit."
                                  : code.toUpperCase() === "FILE_ALREADY_EXISTS"
                                    ? "A file with that name already exists. Choose Replace to overwrite it."
                                    : code.toUpperCase() === "FILE_NOT_FOUND"
                                      ? "That file no longer exists. Refresh the file list."
                                      : code.toUpperCase() === "PROJECT_BUSY"
                                        ? "Another file change is in progress. Please try again."
                                        : code.toUpperCase() === "EMAIL_VERIFICATION_REQUIRED"
                                          ? "Please verify your email address before continuing."
                                          : code.toUpperCase() === "EMAIL_NOT_VERIFIED"
                                            ? "Please verify your email address before creating a website."
                                            : code.toUpperCase() === "EMAIL_UNVERIFIED"
                                              ? "Please verify your email address before creating a website."
                                              : code.toUpperCase() === "DUPLICATE_SLUG"
                                                ? "That subdomain is already in use. Try another one."
                                                : code.toUpperCase() === "DUPLICATE_SUBDOMAIN"
                                                  ? "That subdomain is already in use. Try another one."
                                                  : code.toUpperCase() === "RESERVED_SLUG"
                                                    ? "That subdomain is reserved. Choose a different one."
                                                    : code.toUpperCase() === "RESERVED_SUBDOMAIN"
                                                      ? "That subdomain is reserved. Choose a different one."
                                                      : code.toUpperCase() === "SLUG_TAKEN"
                                                        ? "That subdomain is already in use. Try another one."
                                                        : code.toUpperCase() === "SLUG_ALREADY_EXISTS"
                                                          ? "That subdomain is already in use. Try another one."
                                                          : code.toUpperCase() === "SUBDOMAIN_TAKEN"
                                                            ? "That subdomain is already in use. Try another one."
                                                            : code.toUpperCase() === "PROJECT_SLUG_TAKEN"
                                                              ? "That subdomain is already in use. Try another one."
                                                              : status === 401
                                                                ? "Your session has expired. Please sign in again."
                                                                : status === 400
                                                                  ? "Please check the information you entered."
                                                                  : status === 403
                                                                    ? "You do not have permission to complete this request."
                                                                    : status === 429
                                                                      ? "Too many attempts. Please try again later."
                                                                      : status >= 500
                                                                        ? "The service is temporarily unavailable. Please try again later."
                                                                        : "The service could not complete your request. Please try again.";

    super(
      details.safeMessage ??
        (status === 409 && !code ? normalized.message : legacyMessage),
    );
    this.name = "ApiError";
    this.bbbCode = normalized.code;
    this.identifier = normalized.identifier;
    this.httpStatus = normalized.httpStatus;
    this.operation = normalized.operation;
    this.component = normalized.component;
    this.reason = normalized.reason;
    this.field = normalized.field;
    this.timestamp = normalized.timestamp;
    this.reference = normalized.reference;
    this.referenceSource = normalized.referenceSource;
    this.incidentRecorded = normalized.incidentRecorded;
    this.retryable = normalized.retryable;
  }

  toReport(): string {
    return formatErrorReport({
      code: this.bbbCode,
      identifier: this.identifier,
      httpStatus: this.httpStatus,
      component: this.component,
      operation: this.operation,
      field: this.field,
      reason: this.reason ?? this.message,
      timestamp: this.timestamp,
      reference: this.reference,
      referenceSource: this.referenceSource,
      incidentRecorded: this.incidentRecorded,
      message: this.message,
    });
  }
}

const SAFE_RETRY_CAPABILITIES = new Set([
  "auth.session",
  "projects.list",
  "files.list",
  "files.storage",
  "files.download",
  "github.status",
  "api.info",
  "api.health",
  "api.projectCount",
]);

function makeApiError(
  status: number,
  capability: string,
  reason: string,
  parsed: ReturnType<typeof parseBackendError>,
): ApiError {
  return new ApiError(
    status,
    parsed.identifier ?? (status === 401 ? "UNAUTHORIZED" : ""),
    {
      identifier: parsed.identifier,
      backendCode: parsed.backendCode,
      safeMessage: parsed.safeMessage,
      reference: parsed.reference,
      incidentRecorded: parsed.incidentRecorded,
      operation: capability,
      component: "API Client",
      reason,
      retryable: SAFE_RETRY_CAPABILITIES.has(capability),
    },
  );
}

async function errorFromResponse(
  response: Response,
  capability: string,
  reason: string,
): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  return makeApiError(
    response.status,
    capability,
    reason,
    parseBackendError(payload),
  );
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
      ...(route.noStore ? { cache: "no-store" as const } : {}),
      headers,
    });
  } catch {
    throw createDiagnosticError("NETWORK_ERROR", {
      operation: capability,
      component: "API Client",
      reason: "Network request failed",
      retryable: SAFE_RETRY_CAPABILITIES.has(capability),
    });
  }
  if (!response.ok) {
    if (
      route.session &&
      response.status === 401 &&
      capability !== "auth.login" &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(new Event("bbb-session-expired"));
    const error = await errorFromResponse(response, capability, "Request failed");
    if (
      error.bbbCode === 6007 &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(new Event("bbb-prealpha-access-denied"));
    throw error;
  }
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  if (response.headers.get("Content-Type")?.includes("json")) {
    try {
      return JSON.parse(body) as T;
    } catch {
      throw createDiagnosticError("INVALID_API_RESPONSE", {
        operation: capability,
        component: "API Client",
        reason: "Invalid response shape",
      });
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
    throw createDiagnosticError("NETWORK_ERROR", {
      operation: capability,
      component: "API Client",
      reason: "Network request failed",
      retryable: SAFE_RETRY_CAPABILITIES.has(capability),
    });
  }
  if (!response.ok) {
    if (
      route.session &&
      response.status === 401 &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(new Event("bbb-session-expired"));
    throw await errorFromResponse(response, capability, "Request failed");
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
        createDiagnosticError("NETWORK_ERROR", {
          operation: capability,
          component: "API Client",
          reason: "Network request failed",
        }),
      );
    request.onload = () => {
      let responseUrl: URL;
      try {
        responseUrl = new URL(request.responseURL);
      } catch {
        reject(
          createDiagnosticError("INVALID_API_RESPONSE", {
            operation: capability,
            component: "API Client",
            reason: "Invalid response shape",
          }),
        );
        return;
      }
      if (
        responseUrl.origin !== base ||
        responseUrl.pathname !== expectedUrl.pathname ||
        responseUrl.search !== expectedUrl.search
      ) {
        reject(
          createDiagnosticError("INVALID_API_RESPONSE", {
            operation: capability,
            component: "API Client",
            reason: "Invalid response shape",
          }),
        );
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        let payload: unknown;
        try {
          payload = JSON.parse(request.responseText);
        } catch {
          payload = undefined;
        }
        if (
          route.session &&
          request.status === 401 &&
          typeof window !== "undefined"
        )
          window.dispatchEvent(new Event("bbb-session-expired"));
        reject(
          makeApiError(
            request.status,
            capability,
            "Upload failed",
            parseBackendError(payload),
          ),
        );
        return;
      }
      try {
        resolve(request.responseText ? JSON.parse(request.responseText) : null);
      } catch {
        reject(
          createDiagnosticError("INVALID_API_RESPONSE", {
            operation: capability,
            component: "API Client",
            reason: "Invalid response shape",
          }),
        );
      }
    };
    request.send(file);
  });
}
