import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, resolveApiBaseUrl } from "./api";
import { connectivity } from "./connectivity";
import { billing } from "./billing";
import { websites } from "./websites";
import { files } from "./files";
const origin = "https://api.builtbybuzz.dev";
const mockFetch = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", origin);
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function reply(data: unknown) {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}
describe("API configuration", () => {
  it("accepts only the configured API origin", () => {
    expect(resolveApiBaseUrl(origin + "/")).toBe(origin);
    for (const value of [
      "https://hosting.builtbybuzz.dev",
      "https://builtbybuzz.dev",
      "https://api.example.workers.dev",
      "http://api.builtbybuzz.dev",
      origin + "/v1",
      origin + "?x=1",
      origin + "#x",
      "https://user:secret@api.builtbybuzz.dev",
      "/",
      "invalid",
    ])
      expect(() => resolveApiBaseUrl(value)).toThrow(/VITE_API_BASE_URL/);
  });
  it("explains missing configuration and never falls back to the dashboard", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    await expect(connectivity.health()).rejects.toThrow(
      /configuration is missing/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it("rejects an alternate configured hostname before fetching", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://hosting.builtbybuzz.dev");
    await expect(connectivity.health()).rejects.toThrow(/VITE_API_BASE_URL/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
describe("confirmed API requests", () => {
  it.each([
    ["api.info", "/"],
    ["api.health", "/v1/health"],
    ["api.projectCount", "/v1/dev/project-count"],
  ])(
    "preserves the GET method and absolute URL for %s",
    async (capability, path) => {
      const payload = { success: true, total: 37, status: "operational" };
      reply(payload);
      expect(await api(capability)).toEqual(payload);
      const [url, init] = mockFetch.mock.calls[0];
      expect(String(url)).toBe(origin + path);
      expect(init).toMatchObject({
        method: "GET",
        credentials: "omit",
        redirect: "error",
      });
    },
  );
  it("reads actual health and project count payloads without deriving account statistics", async () => {
    reply({ success: true, service: "bbb-hosting-api", status: "operational" });
    expect(await connectivity.health()).toEqual({
      success: true,
      service: "bbb-hosting-api",
      status: "operational",
    });
    reply({ success: true, total: 81 });
    expect(await connectivity.projectCount()).toEqual({
      success: true,
      total: 81,
    });
  });
  it("sends checkout bearer authentication and project_id", async () => {
    reply({ result: "backend checkout payload" });
    await billing.checkout("immutable_project_id", "test-only-token");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe(origin + "/api/billing/checkout");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      project_id: "immutable_project_id",
    });
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer test-only-token",
    );
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });
  it("requires checkout authentication and a project ID without issuing a request", async () => {
    await expect(billing.checkout("site_a", "")).rejects.toThrow(
      /bearer token/,
    );
    await expect(billing.checkout("", "token")).rejects.toThrow(/project_id/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it("cannot call the webhook or change a confirmed HTTP method", async () => {
    await expect(api("billing.webhook", { method: "POST" })).rejects.toThrow(
      /unavailable/,
    );
    await expect(api("/api/billing/webhook")).rejects.toThrow(/unavailable/);
    await expect(api("api.health", { method: "POST" })).rejects.toThrow(
      /method/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it("keeps unsupported services unavailable without mock successes", async () => {
    for (const request of [
      websites.list(),
      files.list("site_a", "/"),
      billing.summary(),
      billing.portal("site_a"),
    ])
      await expect(request).rejects.toThrow(/unavailable/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it("reports network/CORS, HTTP, and malformed JSON errors", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(connectivity.health()).rejects.toThrow(/CORS/);
    mockFetch.mockResolvedValueOnce(new Response("denied", { status: 403 }));
    await expect(connectivity.health()).rejects.toThrow(/service could not/);
    mockFetch.mockResolvedValueOnce(
      new Response("{broken", {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(connectivity.health()).rejects.toThrow(/invalid JSON/);
  });
  it("preserves plain informational responses", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("BuiltByBuzz API", {
        headers: { "Content-Type": "text/plain" },
      }),
    );
    expect(await connectivity.info()).toBe("BuiltByBuzz API");
  });
});
