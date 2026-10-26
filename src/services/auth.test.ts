import { afterEach, expect, it, vi } from "vitest";
import { auth, parseUser, passwordError, safeDestination } from "./auth";
import { ApiError } from "./api";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("validates password length, UTF-8 bytes and confirmation", () => {
  expect(passwordError("short", "short")).toMatch(/12/);
  expect(passwordError("🔐".repeat(257), "🔐".repeat(257))).toMatch(/1,024/);
  expect(passwordError("long-password", "different")).toMatch(/match/);
  expect(passwordError("long-password", "long-password")).toBe("");
});
it("only accepts internal dashboard destinations", () => {
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/dashboardevil",
    "/dashboard/\\evil",
    null,
  ])
    expect(safeDestination(path)).toBe("/dashboard");
  expect(safeDestination("/dashboard/sites?id=1")).toBe(
    "/dashboard/sites?id=1",
  );
});
it("normalizes real accounts and rejects fabricated fallbacks", () => {
  expect(
    parseUser({
      user: {
        id: "1",
        display_name: "Customer",
        email: "c@example.test",
        email_verified: 1,
        role: "customer",
      },
    }),
  ).toMatchObject({ name: "Customer", emailVerified: true, role: "customer" });
  expect(() => parseUser({ success: true })).toThrow(/unexpected/);
});
it("uses credentialed JSON requests for every auth operation", async () => {
  vi.stubEnv("VITE_API_BASE_URL", "https://api.builtbybuzz.dev");
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        Response.json({
          user: { id: "1", display_name: "Customer", email: "c@example.test" },
        }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  await auth.session();
  await auth.login("c@example.test", "test-password");
  await auth.register("c@example.test", "Customer", "test-password");
  await auth.logout();
  await auth.verify("test-token");
  await auth.forgot("c@example.test");
  await auth.reset("test-token", "test-password");
  expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    "/v1/auth/me",
    "/v1/auth/login",
    "/v1/auth/register",
    "/v1/auth/logout",
    "/v1/auth/verify-email",
    "/v1/auth/forgot-password",
    "/v1/auth/reset-password",
  ]);
  for (const [, init] of fetch.mock.calls) {
    expect(init.credentials).toBe("include");
    expect(init.headers.has("Origin")).toBe(false);
    expect(init.headers.has("Authorization")).toBe(false);
    if (init.method === "POST")
      expect(init.headers.get("Content-Type")).toBe("application/json");
  }
});
it.each([
  [400, "INVALID_INPUT"],
  [400, "INVALID_TOKEN"],
  [401, "INVALID_CREDENTIALS"],
  [401, "UNAUTHORIZED"],
  [403, "ORIGIN_DENIED"],
  [429, "RATE_LIMITED"],
  [503, "AUTH_UNAVAILABLE"],
])("sanitizes %s %s", async (status, code) => {
  vi.stubEnv("VITE_API_BASE_URL", "https://api.builtbybuzz.dev");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code, message: "private internal data" } },
          { status },
        ),
      ),
  );
  await expect(
    auth.login("test@example.test", "test-password"),
  ).rejects.toBeInstanceOf(ApiError);
  try {
    await auth.login("test@example.test", "test-password");
  } catch (e) {
    expect((e as Error).message).not.toContain("private");
  }
});
