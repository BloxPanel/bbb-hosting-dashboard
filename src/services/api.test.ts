import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, resolveApiBaseUrl } from "./api";
import { connectivity } from "./connectivity";
import { billing } from "./billing";
import { websites } from "./websites";
import { files } from "./files";
import { projects } from "./projects";
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
  it("loads the authenticated project list with session cookies", async () => {
    const payload = { projects: [] };
    reply(payload);
    expect(await api("projects.list")).toEqual(payload);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe(origin + "/v1/projects");
    expect(init).toMatchObject({
      method: "GET",
      credentials: "include",
      redirect: "error",
    });
  });
  it("creates a project with only name and slug using the session cookie", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "created-project",
          name: "My Awesome Website",
          slug: "my-awesome-website",
          status: "inactive",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    await projects.create("My Awesome Website", "my-awesome-website");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe(origin + "/v1/projects");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      redirect: "error",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "My Awesome Website",
      slug: "my-awesome-website",
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("owner_id");
  });
  it.each([
    [400, "check the information"],
    [401, "session has expired"],
    [403, "permission to complete"],
    [409, "subdomain is already in use"],
    [429, "Too many attempts"],
    [503, "temporarily unavailable"],
  ])(
    "returns a safe, actionable creation error for HTTP %i",
    async (status, message) => {
      mockFetch.mockResolvedValueOnce(new Response("{}", { status }));
      await expect(projects.create("Example", "example")).rejects.toThrow(
        message,
      );
    },
  );
  it("explains unverified-account errors without exposing backend details", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "EMAIL_NOT_VERIFIED",
            message: "private account details",
          },
        }),
        { status: 403 },
      ),
    );
    await expect(projects.create("Example", "example")).rejects.toThrow(
      "verify your email",
    );
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
      billing.summary(),
      billing.portal("site_a"),
    ])
      await expect(request).rejects.toThrow(/unavailable/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it("uses the project-scoped file listing and storage contracts with cookies", async () => {
    reply({
      success: true,
      files: [
        {
          path: "assets/site.css",
          size: 125,
          content_type: "text/css; charset=utf-8",
          updated_at: "2026-10-29T12:00:00.000Z",
        },
      ],
      next_cursor: "page-2",
    });
    const listing = await files.list("project_1");
    expect(listing).toMatchObject({
      nextCursor: "page-2",
      files: [
        {
          id: "assets/site.css",
          path: "/assets/",
          name: "site.css",
          size: 125,
          mime: "text/css; charset=utf-8",
        },
      ],
    });
    const [listUrl, listInit] = mockFetch.mock.calls[0];
    expect(String(listUrl)).toBe(
      origin + "/v1/projects/project_1/files?limit=100",
    );
    expect(listInit).toMatchObject({
      method: "GET",
      credentials: "include",
      redirect: "error",
    });

    reply({
      success: true,
      storage: {
        bytes_used: 125,
        file_count: 1,
        file_count_limit: 10_000,
        quota_bytes: 1024 * 1024 * 1024,
        percent_used: 0,
      },
    });
    expect(await files.storage("project_1")).toMatchObject({
      bytesUsed: 125,
      fileCount: 1,
      quotaBytes: 1024 * 1024 * 1024,
    });
    expect(String(mockFetch.mock.calls[1][0])).toBe(
      origin + "/v1/projects/project_1/storage",
    );
    expect(mockFetch.mock.calls[1][1]).toMatchObject({
      credentials: "include",
      redirect: "error",
    });
  });
  it("paginates and encodes file routes without accepting invalid project IDs", async () => {
    reply({ success: true, files: [], next_cursor: null });
    await files.list("project_1", "opaque cursor");
    expect(String(mockFetch.mock.calls[0][0])).toBe(
      origin +
        "/v1/projects/project_1/files?limit=100&cursor=opaque+cursor",
    );

    reply({ success: true, deleted: "assets/site.css" });
    await files.remove("project_1", "assets/site.css");
    expect(String(mockFetch.mock.calls[1][0])).toBe(
      origin + "/v1/projects/project_1/files/assets/site.css",
    );
    expect(mockFetch.mock.calls[1][1]).toMatchObject({
      method: "DELETE",
      credentials: "include",
    });

    await expect(files.storage("bad/id")).rejects.toThrow(/project ID/);
    await expect(files.remove("project_1", "../index.html")).rejects.toThrow(
      /file path is invalid/,
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
  it("downloads project file bytes through the cookie-authenticated API", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("<h1>Preview</h1>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );
    const result = await files.download("project_1", "assets/site file.html");
    expect(await result.blob.text()).toBe("<h1>Preview</h1>");
    expect(result.contentType).toBe("text/html; charset=utf-8");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe(
      origin + "/v1/projects/project_1/files/assets/site%20file.html",
    );
    expect(init).toMatchObject({
      method: "GET",
      credentials: "include",
      redirect: "error",
    });
  });
  it("maps file API session expiration and permission errors to safe messages", async () => {
    const expired = vi.fn();
    const eventTarget = new EventTarget();
    vi.stubGlobal("window", eventTarget);
    eventTarget.addEventListener("bbb-session-expired", expired);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(files.list("project_1")).rejects.toThrow(/session has expired/);
    expect(expired).toHaveBeenCalledOnce();
    eventTarget.removeEventListener("bbb-session-expired", expired);

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: "EMAIL_VERIFICATION_REQUIRED",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(files.storage("project_1")).rejects.toThrow(/verify your email/);
  });
  it("reports network/CORS, HTTP, and malformed JSON errors", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(connectivity.health()).rejects.toThrow(/CORS/);
    mockFetch.mockResolvedValueOnce(new Response("denied", { status: 403 }));
    await expect(connectivity.health()).rejects.toThrow(/permission to complete/);
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
