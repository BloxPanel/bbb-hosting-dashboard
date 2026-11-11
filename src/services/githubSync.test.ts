import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  githubSync,
  parseGitHubConnection,
  parseGitHubSyncResult,
  validateRepositoryName,
  validateSourceFolder,
} from "./githubSync";

const origin = "https://api.builtbybuzz.dev";
const projectId = "project_1";
const mockFetch = vi.fn<typeof fetch>();

const connectedPayload = {
  success: true,
  github: {
    connected: true,
    repository: "https://github.com/acme/portfolio",
    branch: "main",
    source_folder: "website",
    daily_sync: false,
    status: "success",
    last_deployed_commit: "0123456789abcdef0123456789abcdef01234567",
    last_check_at: 1794412800,
    last_success_at: 1794412800,
    failure_reason: null,
  },
};

function reply(payload: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", origin);
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GitHub Sync API", () => {
  it("reads a project connection using the documented no-store cookie route", async () => {
    reply(connectedPayload);
    expect(await githubSync.status(projectId)).toMatchObject({
      connected: true,
      repository: "https://github.com/acme/portfolio",
      sourceFolder: "website",
      lastDeployedCommit: "0123456789abcdef0123456789abcdef01234567",
      lastCheckAt: 1794412800,
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe(
      `${origin}/v1/projects/${projectId}/github`,
    );
    expect(init).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
    });
  });

  it("connects with exactly the documented JSON fields", async () => {
    reply(connectedPayload);
    await githubSync.connect(projectId, {
      repository_url: "https://github.com/acme/portfolio",
      branch: "main",
      source_folder: "website",
      daily_sync: true,
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe(
      `${origin}/v1/projects/${projectId}/github`,
    );
    expect(init).toMatchObject({
      method: "PUT",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      repository_url: "https://github.com/acme/portfolio",
      branch: "main",
      source_folder: "website",
      daily_sync: true,
    });
  });

  it("starts a manual sync without inventing a request body", async () => {
    reply({
      sync: {
        status: "unchanged",
        deployed_commit: "0123456789abcdef0123456789abcdef01234567",
        last_check_at: 1794412800,
        last_success_at: 1794412800,
      },
    });
    expect(await githubSync.syncNow(projectId)).toEqual({
      status: "unchanged",
      deployedCommit: "0123456789abcdef0123456789abcdef01234567",
      lastCheckAt: 1794412800,
      lastSuccessAt: 1794412800,
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe(
      `${origin}/v1/projects/${projectId}/github/sync`,
    );
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
    });
    expect(init?.body).toBeUndefined();
  });

  it("disconnects through the documented DELETE route", async () => {
    reply({
      success: true,
      github: {
        connected: false,
        repository: null,
        branch: null,
        source_folder: null,
        daily_sync: false,
        status: "disconnected",
        last_deployed_commit: null,
        last_check_at: null,
        last_success_at: null,
        failure_reason: null,
      },
    });
    expect(await githubSync.disconnect(projectId)).toMatchObject({
      connected: false,
      status: "disconnected",
      repository: null,
    });
    expect(String(mockFetch.mock.calls[0][0])).toBe(
      `${origin}/v1/projects/${projectId}/github`,
    );
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    });
  });

  it("rejects malformed responses and invalid project IDs", async () => {
    expect(() => parseGitHubConnection({ success: true, github: {} })).toThrow(
      /invalid GitHub/,
    );
    expect(() => parseGitHubSyncResult({ success: true, sync: {} })).toThrow(
      /invalid GitHub sync result status/,
    );
    await expect(githubSync.status("project/1")).rejects.toThrow(
      /project ID is invalid/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("GitHub Sync input validation", () => {
  it("requires a public repository in owner/repo form", () => {
    expect(validateRepositoryName("acme/portfolio")).toBeNull();
    expect(validateRepositoryName(" acme/portfolio.git ")).toBeNull();
    expect(validateRepositoryName("")).toMatch(/owner\/repo/);
    expect(validateRepositoryName("https://github.com/acme/portfolio")).toMatch(
      /owner\/repo/,
    );
    expect(validateRepositoryName("acme/portfolio/tree/main")).toMatch(
      /owner\/repo/,
    );
  });

  it("accepts a repository-relative folder or the empty root selection", () => {
    expect(validateSourceFolder("")).toBeNull();
    expect(validateSourceFolder("website/src")).toBeNull();
    expect(validateSourceFolder("/website")).toMatch(/without leading/);
    expect(validateSourceFolder("website/")).toMatch(/without leading/);
    expect(validateSourceFolder("website/../private")).toMatch(
      /without leading/,
    );
  });
});
