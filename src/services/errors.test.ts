import { describe, expect, it } from "vitest";
import {
  BBB_ERROR_REGISTRY,
  createDiagnosticError,
  hasDiagnosticCode,
  isRetrySafeOperation,
  normalizeError,
  parseBackendError,
} from "./errors";

describe("BBB error protocol", () => {
  it("uses the documented protocol codes and identifiers", () => {
    for (const [code, identifier] of [
      [1001, "NOT_FOUND"],
      [1002, "UNAUTHORIZED"],
      [1003, "FORBIDDEN"],
      [1004, "INVALID_INPUT"],
      [1006, "RATE_LIMITED"],
      [2001, "INVALID_FILE_METADATA"],
      [2003, "STORAGE_QUOTA_EXCEEDED"],
      [2004, "FILE_TOO_LARGE"],
      [2005, "UNSUPPORTED_FILE_TYPE"],
      [3001, "SUBDOMAIN_RESERVED"],
      [3002, "SUBDOMAIN_TAKEN"],
      [3003, "INVALID_SUBDOMAIN"],
      [4001, "EMAIL_VERIFICATION_REQUIRED"],
      [4002, "SESSION_EXPIRED"],
      [5002, "HOSTING_INACTIVE"],
    ] as const) {
      expect(BBB_ERROR_REGISTRY[code].identifier).toBe(identifier);
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
    expect(first.message).toBe("Please check the information you entered.");
    expect(first.reference).toMatch(/^BBB-[A-F0-9]{8}$/);
    expect(first.reference).not.toBe(second.reference);
    expect(first.timestamp).toMatch(/Z$/);
    expect(normalizeError(first).reference).toBe(first.reference);
    expect(normalizeError(first).timestamp).toBe(first.timestamp);
  });

  it("allows explicit retries only for safe read operations", () => {
    expect(isRetrySafeOperation("Load Websites")).toBe(true);
    expect(isRetrySafeOperation("Load Files")).toBe(true);
    expect(isRetrySafeOperation("Load Storage")).toBe(true);
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
