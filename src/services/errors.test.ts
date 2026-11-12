import { describe, expect, it } from "vitest";
import {
  BBB_ERROR_REGISTRY,
  createDiagnosticError,
  formatErrorReport,
  hasDiagnosticCode,
  isRetrySafeOperation,
  normalizeError,
  parseBackendError,
} from "./errors";

describe("BBB error protocol", () => {
  it("uses the documented protocol codes and identifiers", () => {
    for (const [code, identifier] of [
      [1000, "UNKNOWN_ERROR"],
      [1001, "NOT_FOUND"],
      [1002, "UNAUTHORIZED"],
      [1003, "FORBIDDEN"],
      [1004, "INVALID_INPUT"],
      [1006, "RATE_LIMITED"],
      [1007, "SERVICE_UNAVAILABLE"],
      [1008, "NETWORK_ERROR"],
      [1009, "INVALID_API_RESPONSE"],
      [2001, "INVALID_FILE_METADATA"],
      [2002, "FILE_UPLOAD_FAILED"],
      [2003, "STORAGE_QUOTA_EXCEEDED"],
      [2004, "FILE_TOO_LARGE"],
      [2005, "UNSUPPORTED_FILE_TYPE"],
      [2006, "FILE_NOT_FOUND"],
      [2007, "FILE_DELETE_FAILED"],
      [2008, "FILE_REPLACE_FAILED"],
      [2009, "FILE_LIST_FAILED"],
      [3001, "SUBDOMAIN_RESERVED"],
      [3002, "SUBDOMAIN_TAKEN"],
      [3003, "INVALID_SUBDOMAIN"],
      [3004, "WEBSITE_CREATION_FAILED"],
      [3005, "WEBSITE_NOT_FOUND"],
      [4001, "EMAIL_VERIFICATION_REQUIRED"],
      [4002, "SESSION_EXPIRED"],
      [4003, "INVALID_CREDENTIALS"],
      [4004, "ACCOUNT_DISABLED"],
      [5001, "PAYMENT_FAILED"],
      [5002, "HOSTING_INACTIVE"],
      [5003, "BILLING_UNAVAILABLE"],
      [6001, "INVITATION_REQUIRED"],
      [6002, "INVALID_INVITATION"],
      [6003, "INVITATION_EXPIRED"],
      [6004, "INVITATION_REVOKED"],
      [6005, "INVITATION_ALREADY_REDEEMED"],
      [6006, "INVITATION_EMAIL_MISMATCH"],
      [6007, "PREALPHA_ACCESS_DENIED"],
    ] as const) {
      expect(BBB_ERROR_REGISTRY[code].identifier).toBe(identifier);
    }
  });

  it("maps documented legacy identifiers to their backend numeric codes", () => {
    for (const [identifier, code] of [
      ["INTERNAL_SERVER_ERROR", 1007],
      ["AUTH_UNAVAILABLE", 1007],
      ["PROJECT_NOT_FOUND", 3005],
      ["ORIGIN_DENIED", 1003],
      ["CORS_PREFLIGHT_DENIED", 1003],
      ["INVALID_TOKEN", 1004],
      ["INVALID_PAGINATION", 1004],
      ["INVALID_UPLOAD", 2001],
      ["INVALID_PATH", 2001],
      ["CONTENT_LENGTH_REQUIRED", 2001],
      ["METHOD_NOT_ALLOWED", 1004],
      ["PROJECT_LIMIT_REACHED", 1005],
      ["PROJECT_BUSY", 1005],
      ["FILE_ALREADY_EXISTS", 1005],
      ["SUBDOMAIN_UNAVAILABLE", 3002],
      ["FILE_COUNT_LIMIT_EXCEEDED", 2003],
      ["STORAGE_LIMIT_EXCEEDED", 2003],
      ["GITHUB_REPOSITORY_INVALID", 1004],
      ["GITHUB_REPOSITORY_TOO_LARGE", 2004],
      ["GITHUB_SYNC_CONFLICT", 1005],
      ["GITHUB_SYNC_FAILED", 1007],
      ["GITHUB_NOT_CONNECTED", 1005],
    ] as const) {
      expect(parseBackendError({ error: identifier, code })).toMatchObject({
        identifier,
        backendCode: code,
      });
    }
  });

  it("accepts a matching numeric code, identifier, and registered safe message", () => {
    expect(
      parseBackendError({
        success: false,
        error: "UNAUTHORIZED",
        code: 1002,
        message: "Please sign in to continue.",
      }),
    ).toEqual({
      identifier: "UNAUTHORIZED",
      backendCode: 1002,
      safeMessage: "Please sign in to continue.",
    });
  });

  it("preserves backend incident references and recording status unchanged", () => {
    const reference = "BBB-AUTH-8F2A91C74D60";
    expect(
      parseBackendError({
        error: "UNAUTHORIZED",
        code: 1002,
        message: "Please sign in to continue.",
        reference,
        incidentRecorded: false,
      }),
    ).toEqual({
      identifier: "UNAUTHORIZED",
      backendCode: 1002,
      safeMessage: "Please sign in to continue.",
      reference,
      incidentRecorded: false,
    });

    expect(
      normalizeError(
        { status: 401, code: "UNAUTHORIZED", bbbCode: 1002 },
        { reference, incidentRecorded: false },
      ),
    ).toMatchObject({
      reference,
      referenceSource: "backend",
      incidentRecorded: false,
    });
  });

  it("keeps historical references and uses a distinct client reference when absent", () => {
    expect(
      parseBackendError({
        error: "UNAUTHORIZED",
        code: 1002,
        reference: "BBB-8F2A91C7",
      }).reference,
    ).toBe("BBB-8F2A91C7");
    const legacy = normalizeError(
      { reference: "BBB-8F2A91C7" },
      { identifier: "UNAUTHORIZED", backendCode: 1002 },
    );
    expect(legacy.reference).toBe("BBB-8F2A91C7");
    expect(legacy.referenceSource).toBe("backend");

    const local = normalizeError(new Error("private detail"));
    expect(local.reference).toMatch(/^CLIENT-[A-F0-9]{12}$/);
    expect(local.referenceSource).toBe("client");
    expect(local.report).toContain(
      "Incident recording: Frontend-only; not automatically recorded in D1",
    );
    expect(local.report).not.toContain("private detail");
  });

  it("creates a copyable report with safe message and preserved operation and time", () => {
    const report = formatErrorReport({
      code: 1002,
      identifier: "UNAUTHORIZED",
      httpStatus: 401,
      component: "API Client",
      operation: "auth.session",
      field: undefined,
      reason: undefined,
      timestamp: "2026-11-11T20:30:00.000Z",
      reference: "BBB-AUTH-8F2A91C74D60",
      referenceSource: "backend",
      incidentRecorded: true,
      message: "Please sign in to continue.",
    });
    expect(report).toContain("Message: Please sign in to continue.");
    expect(report).toContain("Operation: auth.session");
    expect(report).toContain("Timestamp (UTC): 2026-11-11T20:30:00.000Z");
    expect(report).toContain("Reference: BBB-AUTH-8F2A91C74D60");
    expect(report).toContain("Incident recording: Recorded by the backend");
  });

  it("handles absent diagnostic fields safely in reports", () => {
    const report = normalizeError({}).report;
    expect(report).toContain("HTTP Status: Unknown");
    expect(report).toContain("Component: Unknown");
    expect(report).toContain("Operation: Unknown");
    expect(report).toContain("Affected Field: Unknown");
    expect(report).toMatch(/Reference: CLIENT-[A-F0-9]{12}/);
  });

  it("accepts documented invitation errors and never trusts arbitrary messages", () => {
    expect(
      parseBackendError({
        success: false,
        error: "INVITATION_EXPIRED",
        code: 6003,
        message: "This invitation has expired.",
      }),
    ).toEqual({
      identifier: "INVITATION_EXPIRED",
      backendCode: 6003,
      safeMessage: "This invitation has expired.",
    });
    expect(
      normalizeError(
        {
          status: 410,
          code: "INVITATION_REVOKED",
          identifier: "INVITATION_REVOKED",
          bbbCode: 6004,
        },
        { status: 410, identifier: "INVITATION_REVOKED", backendCode: 6004 },
      ),
    ).toMatchObject({
      code: 6004,
      identifier: "INVITATION_REVOKED",
      message: "This invitation is no longer available.",
    });
    expect(BBB_ERROR_REGISTRY[6004].message).not.toContain("token");
  });

  it("maps GitHub Sync failures onto existing BBB error codes", () => {
    expect(
      parseBackendError({
        error: "GITHUB_SYNC_CONFLICT",
        code: 1005,
      }),
    ).toEqual({
      identifier: "GITHUB_SYNC_CONFLICT",
      backendCode: 1005,
      safeMessage:
        "GitHub Sync found a file changed both in GitHub and the built-in editor. Resolve the file conflict before retrying.",
    });
    expect(
      parseBackendError({
        error: "GITHUB_REPOSITORY_TOO_LARGE",
        code: 2004,
      }),
    ).toMatchObject({
      identifier: "GITHUB_REPOSITORY_TOO_LARGE",
      backendCode: 2004,
    });
  });

  it("does not trust unknown, malformed, or mismatched numeric codes", () => {
    expect(
      parseBackendError({
        error: "UNAUTHORIZED",
        code: 9001,
        message: "private token value",
      }),
    ).toEqual({});
    expect(
      parseBackendError({
        error: "UNAUTHORIZED",
        code: 1003,
        message: "private token value",
      }),
    ).toEqual({});
    expect(
      parseBackendError({
        error: "UNAUTHORIZED",
        code: "1002",
        message: "private token value",
      }),
    ).toMatchObject({
      identifier: "UNAUTHORIZED",
      backendCode: 1002,
    });
  });

  it("preserves supported legacy identifiers without trusting arbitrary messages", () => {
    expect(parseBackendError({ error: "ORIGIN_DENIED" })).toMatchObject({
      identifier: "ORIGIN_DENIED",
      backendCode: 1003,
    });
    expect(
      parseBackendError({
        error: "EMAIL_VERIFICATION_REQUIRED",
        message: "customer email is private",
      }),
    ).toMatchObject({
      identifier: "EMAIL_VERIFICATION_REQUIRED",
      backendCode: 4001,
      safeMessage: undefined,
    });
  });

  it("preserves real HTTP status and uses a safe status fallback", () => {
    const error = normalizeError(
      { status: 503, message: "internal stack and credentials" },
      { operation: "Load Websites" },
    );
    expect(error).toMatchObject({
      code: 1007,
      identifier: "SERVICE_UNAVAILABLE",
      httpStatus: 503,
    });
    expect(error.message).not.toContain("credentials");
  });

  it("uses the unknown-code fallback when neither a code nor status is known", () => {
    const error = normalizeError(new Error("raw database details"));
    expect(error).toMatchObject({
      code: 1000,
      identifier: "UNKNOWN_ERROR",
    });
    expect(error.httpStatus).toBeUndefined();
    expect(error.report).not.toContain("raw database details");
  });

  it("keeps diagnostic metadata safe and redacts private paths and values", () => {
    const error = createDiagnosticError("INVALID_FILE_METADATA", {
      component: "File Manager",
      operation: "Load Files",
      field: "path",
      reason: "Failed validation",
    });
    const details = normalizeError(error);
    expect(details).toMatchObject({
      code: 2001,
      field: "path",
      reason: "Failed validation",
    });
    expect(details.report).not.toContain("customer");
    expect(details.report).not.toContain("secret");
    expect(hasDiagnosticCode(error)).toBe(true);

    const unsafe = normalizeError(
      new Error("Authorization: Bearer customer-secret"),
      {
        identifier: "INVALID_FILE_METADATA",
        component: "File Manager",
        operation: "Load Files",
        field: "path",
        reason: "Failed validation /private/customer/file.txt",
      },
    );
    expect(unsafe.report).not.toContain("customer-secret");
    expect(unsafe.report).not.toContain("/private/customer/file.txt");
    expect(unsafe.report).not.toContain("Authorization");
  });

  it("creates unique occurrence references and UTC timestamps once", () => {
    const first = createDiagnosticError("INVALID_INPUT");
    const second = createDiagnosticError("INVALID_INPUT");
    expect(first.message).toBe("Please check your request and try again.");
    expect(first.reference).toMatch(/^CLIENT-[A-F0-9]{12}$/);
    expect(first.reference).not.toBe(second.reference);
    expect(first.timestamp).toMatch(/Z$/);
    expect(normalizeError(first).reference).toBe(first.reference);
    expect(normalizeError(first).timestamp).toBe(first.timestamp);
  });

  it("allows explicit retries only for safe read operations", () => {
    expect(isRetrySafeOperation("Load Websites")).toBe(true);
    expect(isRetrySafeOperation("Load Files")).toBe(true);
    expect(isRetrySafeOperation("Load Storage")).toBe(true);
    expect(isRetrySafeOperation("github.status")).toBe(true);
    expect(isRetrySafeOperation("github.connect")).toBe(false);
    expect(isRetrySafeOperation("github.sync")).toBe(false);
    expect(isRetrySafeOperation("github.disconnect")).toBe(false);
    expect(isRetrySafeOperation("Create Website")).toBe(false);
    expect(isRetrySafeOperation("Upload File")).toBe(false);
    expect(isRetrySafeOperation("Replace File")).toBe(false);
    expect(isRetrySafeOperation("Delete File")).toBe(false);
    expect(isRetrySafeOperation("Billing")).toBe(false);
  });

  it("does not enable retry by default for mutations or unknown operations", () => {
    expect(normalizeError(new Error(), { operation: "Upload File" }).retryable).toBe(false);
    expect(normalizeError(new Error(), { operation: "Create Website" }).retryable).toBe(false);
  });
});
