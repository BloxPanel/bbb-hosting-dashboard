export interface ErrorCodeDefinition {
  readonly code: number;
  readonly identifier: string;
  readonly message: string;
  readonly category: string;
  readonly retryable: boolean;
}

export interface ErrorContext {
  readonly status?: number;
  readonly identifier?: string;
  readonly backendCode?: number;
  readonly operation?: string;
  readonly component?: string;
  readonly field?: string;
  readonly reason?: string;
  readonly message?: string;
  readonly retryable?: boolean;
}

export interface NormalizedError {
  readonly code: number;
  readonly identifier: string;
  readonly message: string;
  readonly httpStatus?: number;
  readonly operation?: string;
  readonly component?: string;
  readonly reason?: string;
  readonly field?: string;
  readonly timestamp: string;
  readonly reference: string;
  readonly retryable: boolean;
  readonly report: string;
}

const definitions: readonly ErrorCodeDefinition[] = [
  { code: 1000, identifier: "UNKNOWN_ERROR", message: "Something unexpected happened.", category: "General errors", retryable: false },
  { code: 1001, identifier: "NOT_FOUND", message: "The requested resource could not be found.", category: "General errors", retryable: false },
  { code: 1002, identifier: "UNAUTHORIZED", message: "Please sign in to continue.", category: "General errors", retryable: false },
  { code: 1003, identifier: "FORBIDDEN", message: "You don't have permission to perform this action.", category: "General errors", retryable: false },
  { code: 1004, identifier: "INVALID_INPUT", message: "Please check the information you entered.", category: "General errors", retryable: false },
  { code: 1005, identifier: "CONFLICT", message: "This resource already exists.", category: "General errors", retryable: false },
  { code: 1006, identifier: "RATE_LIMITED", message: "Too many requests. Please try again later.", category: "General errors", retryable: false },
  { code: 1007, identifier: "SERVICE_UNAVAILABLE", message: "This service is temporarily unavailable.", category: "General errors", retryable: false },
  { code: 1008, identifier: "NETWORK_ERROR", message: "Unable to contact the service.", category: "General errors", retryable: false },
  { code: 1009, identifier: "INVALID_API_RESPONSE", message: "The service returned an unexpected response.", category: "General errors", retryable: false },
  { code: 2001, identifier: "INVALID_FILE_METADATA", message: "The file manager received unexpected file information.", category: "File management", retryable: false },
  { code: 2002, identifier: "FILE_UPLOAD_FAILED", message: "Your file could not be uploaded.", category: "File management", retryable: false },
  { code: 2003, identifier: "STORAGE_QUOTA_EXCEEDED", message: "Your website has reached its storage limit.", category: "File management", retryable: false },
  { code: 2004, identifier: "FILE_TOO_LARGE", message: "This file exceeds the maximum upload size.", category: "File management", retryable: false },
  { code: 2005, identifier: "UNSUPPORTED_FILE_TYPE", message: "This file type is not supported.", category: "File management", retryable: false },
  { code: 2006, identifier: "FILE_NOT_FOUND", message: "The requested file could not be found.", category: "File management", retryable: false },
  { code: 2007, identifier: "FILE_DELETE_FAILED", message: "The file could not be deleted.", category: "File management", retryable: false },
  { code: 2008, identifier: "FILE_REPLACE_FAILED", message: "The file could not be replaced.", category: "File management", retryable: false },
  { code: 2009, identifier: "FILE_LIST_FAILED", message: "Your website's files could not be loaded.", category: "File management", retryable: false },
  { code: 3001, identifier: "SUBDOMAIN_RESERVED", message: "That subdomain is reserved. Choose a different subdomain.", category: "Websites and subdomains", retryable: false },
  { code: 3002, identifier: "SUBDOMAIN_TAKEN", message: "That subdomain is already registered.", category: "Websites and subdomains", retryable: false },
  { code: 3003, identifier: "INVALID_SUBDOMAIN", message: "Please enter a valid subdomain.", category: "Websites and subdomains", retryable: false },
  { code: 3004, identifier: "WEBSITE_CREATION_FAILED", message: "Your website could not be created.", category: "Websites and subdomains", retryable: false },
  { code: 3005, identifier: "WEBSITE_NOT_FOUND", message: "The requested website could not be found.", category: "Websites and subdomains", retryable: false },
  { code: 4001, identifier: "EMAIL_VERIFICATION_REQUIRED", message: "Please verify your email address.", category: "Authentication", retryable: false },
  { code: 4002, identifier: "SESSION_EXPIRED", message: "Your session has expired. Please sign in again.", category: "Authentication", retryable: false },
  { code: 4003, identifier: "INVALID_CREDENTIALS", message: "The provided credentials are incorrect.", category: "Authentication", retryable: false },
  { code: 4004, identifier: "ACCOUNT_DISABLED", message: "This account is unavailable.", category: "Authentication", retryable: false },
  { code: 5001, identifier: "PAYMENT_FAILED", message: "Your payment could not be completed.", category: "Billing and hosting", retryable: false },
  { code: 5002, identifier: "HOSTING_INACTIVE", message: "This website's hosting is not active.", category: "Billing and hosting", retryable: false },
  { code: 5003, identifier: "BILLING_UNAVAILABLE", message: "Billing is temporarily unavailable.", category: "Billing and hosting", retryable: false },
];

export const BBB_ERROR_REGISTRY: Readonly<Record<number, ErrorCodeDefinition>> =
  Object.freeze(Object.fromEntries(definitions.map((entry) => [entry.code, entry])));

const definitionByIdentifier = new Map(
  definitions.map((entry) => [entry.identifier, entry]),
);

const legacyIdentifiers: Readonly<Record<string, number>> = Object.freeze({
  ORIGIN_DENIED: 1003,
  SUBDOMAIN_UNAVAILABLE: 3002,
  RESERVED_SUBDOMAIN: 3001,
  DUPLICATE_SLUG: 3002,
  DUPLICATE_SUBDOMAIN: 3002,
  RESERVED_SLUG: 3001,
  SLUG_TAKEN: 3002,
  SLUG_ALREADY_EXISTS: 3002,
  PROJECT_SLUG_TAKEN: 3002,
  EMAIL_NOT_VERIFIED: 4001,
  EMAIL_UNVERIFIED: 4001,
  AUTH_UNAVAILABLE: 1007,
  STORAGE_LIMIT_EXCEEDED: 2003,
  INVALID_PATH: 1004,
  INVALID_UPLOAD: 2002,
  FILE_ALREADY_EXISTS: 1005,
  FILE_COUNT_LIMIT_EXCEEDED: 2003,
  PROJECT_BUSY: 1005,
  CONTENT_LENGTH_REQUIRED: 1004,
  INVALID_TOKEN: 1004,
});

const legacyMessages: Readonly<Record<string, string>> = Object.freeze({
  INVALID_TOKEN: "This link is invalid, expired, or already used. Request a new link.",
  INVALID_CREDENTIALS: "Email or password is incorrect.",
  UNAUTHORIZED: "Your session has expired. Please sign in again.",
  ORIGIN_DENIED: "This action is not allowed from this dashboard address.",
  RATE_LIMITED: "Too many attempts. Please wait before trying again.",
  AUTH_UNAVAILABLE: "Authentication is temporarily unavailable. Please try again later.",
  INVALID_PATH: "That file path is not allowed. Use a simple name and supported folder path.",
  UNSUPPORTED_FILE_TYPE: "This file type is not supported. Choose an allowed website file type.",
  CONTENT_LENGTH_REQUIRED: "The API rejected this upload because it did not receive a file size. The browser cannot set Content-Length manually; please try another supported browser or contact support.",
  INVALID_UPLOAD: "The API could not verify the complete file upload. Please try uploading the file again.",
  FILE_TOO_LARGE: "Files must be 25 MiB or smaller.",
  STORAGE_LIMIT_EXCEEDED: "This upload would exceed the website's 1 GiB storage limit.",
  FILE_COUNT_LIMIT_EXCEEDED: "This website has reached its 10,000-file limit.",
  FILE_ALREADY_EXISTS: "A file with that name already exists. Choose Replace to overwrite it.",
  FILE_NOT_FOUND: "That file no longer exists. Refresh the file list.",
  PROJECT_BUSY: "Another file change is in progress. Please try again.",
  EMAIL_VERIFICATION_REQUIRED: "Please verify your email address before continuing.",
  EMAIL_NOT_VERIFIED: "Please verify your email address before creating a website.",
  EMAIL_UNVERIFIED: "Please verify your email address before creating a website.",
  DUPLICATE_SLUG: "That subdomain is already in use. Try another one.",
  DUPLICATE_SUBDOMAIN: "That subdomain is already in use. Try another one.",
  RESERVED_SLUG: "That subdomain is reserved. Choose a different one.",
  RESERVED_SUBDOMAIN: "That subdomain is reserved. Choose a different one.",
  SLUG_TAKEN: "That subdomain is already in use. Try another one.",
  SLUG_ALREADY_EXISTS: "That subdomain is already in use. Try another one.",
  SUBDOMAIN_TAKEN: "That subdomain is already in use. Try another one.",
  PROJECT_SLUG_TAKEN: "That subdomain is already in use. Try another one.",
});

const SAFE_REASONS = new Set([
  "Request failed",
  "Upload failed",
  "Download failed",
  "Delete failed",
  "Failed validation",
  "Unexpected response shape",
  "Network request failed",
  "Invalid response shape",
]);
const SAFE_FIELDS = new Set([
  "path",
  "size",
  "content_type",
  "updated_at",
  "files",
  "next_cursor",
  "storage",
  "bytes_used",
  "file_count",
  "file_count_limit",
  "quota_bytes",
  "percent_used",
]);
const SAFE_LABELS = new Set([
  "API Client",
  "File Manager",
  "Websites",
  "Authentication",
  "API Connectivity",
  "auth.session",
  "auth.login",
  "auth.register",
  "auth.logout",
  "auth.verify",
  "auth.forgot",
  "auth.reset",
  "projects.list",
  "projects.create",
  "files.list",
  "files.upload",
  "files.replace",
  "files.delete",
  "files.storage",
  "files.download",
  "api.info",
  "api.health",
  "api.projectCount",
  "billing.checkout",
  "Load Websites",
  "Create Website",
  "Account Request",
  "Load Files",
  "Load Storage",
  "Upload File",
  "Replace File",
  "Download File",
  "Delete File",
  "Load Preview",
  "Check API Health",
  "Read Project Count",
]);
const SAFE_RETRY_OPERATIONS = new Set([
  "auth.session",
  "projects.list",
  "files.list",
  "files.storage",
  "files.download",
  "api.info",
  "api.health",
  "api.projectCount",
  "Load Websites",
  "Load Files",
  "Load Storage",
  "Download File",
  "Load Preview",
  "Check API Health",
  "Read Project Count",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasDiagnosticCode(value: unknown): boolean {
  return isRecord(value) &&
    (typeof value.identifier === "string" ||
      (typeof value.bbbCode === "number" &&
        Object.hasOwn(BBB_ERROR_REGISTRY, value.bbbCode)));
}

export function isRetrySafeOperation(operation: string | undefined): boolean {
  return operation !== undefined && SAFE_RETRY_OPERATIONS.has(operation);
}

export function makeTraceReference(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = crypto.getRandomValues(new Uint8Array(4));
      return `BBB-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    }
  } catch {
    // Secure randomness may be unavailable in non-secure browser contexts.
  }
  return `BBB-${Math.random().toString(16).slice(2, 10).padEnd(8, "0").toUpperCase()}`;
}

function identifierDefinition(identifier: unknown): ErrorCodeDefinition | undefined {
  if (typeof identifier !== "string") return undefined;
  const key = identifier.trim().toUpperCase();
  return definitionByIdentifier.get(key) ??
    (legacyIdentifiers[key] ? BBB_ERROR_REGISTRY[legacyIdentifiers[key]] : undefined);
}

function statusDefinition(status?: number): ErrorCodeDefinition | undefined {
  if (status === 400) return BBB_ERROR_REGISTRY[1004];
  if (status === 401) return BBB_ERROR_REGISTRY[1002];
  if (status === 403) return BBB_ERROR_REGISTRY[1003];
  if (status === 404) return BBB_ERROR_REGISTRY[1001];
  if (status === 409) return BBB_ERROR_REGISTRY[1005];
  if (status === 413) return BBB_ERROR_REGISTRY[1004];
  if (status === 429) return BBB_ERROR_REGISTRY[1006];
  if (status !== undefined && status >= 500) return BBB_ERROR_REGISTRY[1007];
  return undefined;
}

export interface ParsedBackendError {
  readonly identifier?: string;
  readonly backendCode?: number;
  readonly safeMessage?: string;
}

export function parseBackendError(
  payload: unknown,
): ParsedBackendError {
  if (!isRecord(payload)) return {};

  const rawIdentifier =
    typeof payload.error === "string"
      ? payload.error
      : isRecord(payload.error) && typeof payload.error.code === "string"
        ? payload.error.code
        : undefined;
  const identifier = rawIdentifier?.trim().toUpperCase();
  const identifierEntry = identifierDefinition(identifier);
  const numericCode = payload.code;
  const codeEntry =
    typeof numericCode === "number" &&
    Number.isInteger(numericCode) &&
    Object.hasOwn(BBB_ERROR_REGISTRY, numericCode)
      ? BBB_ERROR_REGISTRY[numericCode]
      : undefined;
  const preservedIdentifier =
    identifier && Object.hasOwn(legacyIdentifiers, identifier)
      ? identifier
      : identifierEntry?.identifier;
  const fallbackLegacyMessage =
    identifier && legacyMessages[identifier] ? legacyMessages[identifier] : undefined;

  if (typeof numericCode === "number") {
    if (!codeEntry || (identifierEntry && codeEntry.code !== identifierEntry.code)) {
      return {};
    }
    if (!identifierEntry && identifier) return {};
    const matchedIdentifier = preservedIdentifier ?? codeEntry.identifier;
    const trustedMessage =
      typeof payload.message === "string" &&
      (payload.message === codeEntry.message ||
        (fallbackLegacyMessage !== undefined && payload.message === fallbackLegacyMessage))
        ? payload.message
        : payload.message === undefined && fallbackLegacyMessage !== undefined
          ? fallbackLegacyMessage
          : undefined;
    return {
      identifier: matchedIdentifier,
      backendCode: codeEntry.code,
      safeMessage: trustedMessage ?? codeEntry.message,
    };
  }

  if (identifierEntry) {
    const legacyMessage =
      typeof payload.message === "string" &&
      fallbackLegacyMessage !== undefined &&
      payload.message === fallbackLegacyMessage
        ? payload.message
        : undefined;
    const safeMessage =
      legacyMessage ??
      (typeof payload.message === "string" && payload.message === identifierEntry.message
        ? payload.message
        : payload.message === undefined && fallbackLegacyMessage !== undefined
          ? fallbackLegacyMessage
          : undefined);
    return {
      identifier: preservedIdentifier ?? identifierEntry.identifier,
      backendCode: identifierEntry.code,
      safeMessage,
    };
  }

  return { identifier };
}

function safeLabel(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_LABELS.has(value)
    ? value
    : undefined;
}

function safeReason(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_REASONS.has(value)
    ? value
    : undefined;
}

export function formatErrorReport(
  details: Pick<
    NormalizedError,
    | "code"
    | "identifier"
    | "httpStatus"
    | "component"
    | "operation"
    | "field"
    | "reason"
    | "timestamp"
    | "reference"
    | "message"
  >,
): string {
  const definition = BBB_ERROR_REGISTRY[details.code] ?? BBB_ERROR_REGISTRY[1000];
  const timestamp =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(details.timestamp) &&
    !Number.isNaN(Date.parse(details.timestamp))
      ? details.timestamp
      : new Date().toISOString();
  const reference = /^BBB-[A-F0-9]{8}$/.test(details.reference)
    ? details.reference
    : makeTraceReference();
  return [
    "BuiltByBuzz Hosting — Error Report",
    "",
    `BBB Error Code: ${definition.code}`,
    `Identifier: ${definition.identifier}`,
    details.httpStatus !== undefined &&
    Number.isInteger(details.httpStatus) &&
    details.httpStatus >= 100 &&
    details.httpStatus <= 599
      ? `HTTP Status: ${details.httpStatus}`
      : "HTTP Status: Unknown",
    `Component: ${safeLabel(details.component) ?? "Unknown"}`,
    `Operation: ${safeLabel(details.operation) ?? "Unknown"}`,
    `Affected Field: ${typeof details.field === "string" && SAFE_FIELDS.has(details.field) ? details.field : "Unknown"}`,
    `Reason: ${safeReason(details.reason) ?? definition.message}`,
    `Timestamp (UTC): ${timestamp}`,
    `Reference: ${reference}`,
  ].join("\n");
}

export function normalizeError(
  error: unknown,
  context: ErrorContext = {},
): NormalizedError {
  const record = isRecord(error) ? error : undefined;
  const rawStatus = context.status ??
    (typeof record?.status === "number" &&
    Number.isInteger(record.status) &&
    record.status >= 100 &&
    record.status <= 599
      ? record.status
      : typeof record?.httpStatus === "number" &&
          Number.isInteger(record.httpStatus) &&
          record.httpStatus >= 100 &&
          record.httpStatus <= 599
        ? record.httpStatus
        : undefined);

  const existingCode = typeof record?.bbbCode === "number"
    ? record.bbbCode
    : undefined;
  const existingIdentifier =
    typeof record?.identifier === "string" ? record.identifier : undefined;
  const backendIdentifier =
    context.identifier ??
    (typeof record?.code === "string" ? record.code : undefined);
  const identified = identifierDefinition(backendIdentifier ?? existingIdentifier);
  const fromNumeric =
    context.backendCode !== undefined &&
    Object.hasOwn(BBB_ERROR_REGISTRY, context.backendCode)
      ? BBB_ERROR_REGISTRY[context.backendCode]
      : existingCode !== undefined &&
          Object.hasOwn(BBB_ERROR_REGISTRY, existingCode)
        ? BBB_ERROR_REGISTRY[existingCode]
        : undefined;
  const consistent = !identified || !fromNumeric || identified.code === fromNumeric.code;
  const definition = consistent
    ? fromNumeric ?? identified ?? statusDefinition(rawStatus) ?? BBB_ERROR_REGISTRY[1000]
    : statusDefinition(rawStatus) ?? BBB_ERROR_REGISTRY[1000];

  const messageFromError =
    typeof record?.serverMessage === "string"
      ? record.serverMessage
      : error instanceof Error
        ? error.message
        : undefined;
  const legacyIdentifier = backendIdentifier?.toUpperCase();
  const identifierLegacyMessage = legacyIdentifier
    ? legacyMessages[legacyIdentifier]
    : undefined;
  const safeMessage =
    context.message === definition.message
      ? context.message
      : messageFromError === definition.message
        ? messageFromError
        : identifierLegacyMessage !== undefined &&
            (messageFromError === undefined || messageFromError === identifierLegacyMessage)
          ? identifierLegacyMessage
          : typeof messageFromError === "string" &&
              Object.values(legacyMessages).includes(messageFromError)
            ? messageFromError
          : definition.message;

  const existingTimestamp =
    typeof record?.timestamp === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(record.timestamp) &&
    !Number.isNaN(Date.parse(record.timestamp))
      ? record.timestamp
      : undefined;
  const existingReference =
    typeof record?.reference === "string" &&
    /^BBB-[A-F0-9]{8}$/.test(record.reference)
      ? record.reference
      : undefined;
  const timestamp = existingTimestamp ?? new Date().toISOString();
  const reference = existingReference ?? makeTraceReference();
  const component = safeLabel(context.component ?? record?.component);
  const operation = safeLabel(context.operation ?? record?.operation);
  const rawField = context.field ?? record?.field;
  const field =
    typeof rawField === "string" && SAFE_FIELDS.has(rawField)
      ? rawField
      : undefined;
  const reason = safeReason(record?.reason ?? context.reason) ??
    (definition.identifier === "INVALID_FILE_METADATA"
      ? "Failed validation"
      : undefined);
  const retryable = context.retryable ??
    (typeof record?.retryable === "boolean" ? record.retryable : false);

  const base = {
    code: definition.code,
    identifier: definition.identifier,
    message: safeMessage,
    httpStatus: rawStatus,
    operation,
    component,
    reason,
    field,
    timestamp,
    reference,
    retryable,
  };
  return { ...base, report: formatErrorReport(base) };
}

export function createDiagnosticError(
  identifier: string,
  context: Omit<ErrorContext, "identifier"> = {},
): Error & Partial<NormalizedError> {
  const details = normalizeError(undefined, { ...context, identifier });
  const error = new Error(details.message) as Error & Partial<NormalizedError>;
  error.name = "DashboardDiagnosticError";
  Object.assign(error, details);
  return error;
}

export function safeErrorDetails(
  error: unknown,
  context: ErrorContext = {},
): NormalizedError {
  return normalizeError(error, context);
}
