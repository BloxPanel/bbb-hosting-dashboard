import { api } from "./api";

export type GitHubSyncStatus =
  | "disconnected"
  | "connected"
  | "syncing"
  | "success"
  | "unchanged"
  | "failed"
  | "conflict";

export interface GitHubConnection {
  connected: boolean;
  repository: string | null;
  branch: string | null;
  sourceFolder: string | null;
  dailySync: boolean;
  status: GitHubSyncStatus;
  lastDeployedCommit: string | null;
  lastCheckAt: number | null;
  lastSuccessAt: number | null;
  failureReason: string | null;
}

export interface GitHubConnectionInput {
  repository_url: string;
  branch?: string;
  source_folder?: string;
  daily_sync: boolean;
}

export interface GitHubSyncResult {
  status: "success" | "unchanged";
  deployedCommit: string;
  lastCheckAt: number | null;
  lastSuccessAt: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredBoolean(
  value: unknown,
  field: string,
): boolean {
  if (typeof value !== "boolean")
    throw new Error(`The API returned an invalid GitHub ${field}.`);
  return value;
}

function nullableString(
  value: unknown,
  field: string,
): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  throw new Error(`The API returned an invalid GitHub ${field}.`);
}

function nullableTimestamp(
  value: unknown,
  field: string,
): number | null {
  if (value === null) return null;
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  )
    return value;
  throw new Error(`The API returned an invalid GitHub ${field}.`);
}

const syncStatuses = new Set<GitHubSyncStatus>([
  "disconnected",
  "connected",
  "syncing",
  "success",
  "unchanged",
  "failed",
  "conflict",
]);

export function parseGitHubConnection(payload: unknown): GitHubConnection {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.github))
    throw new Error("The API returned an unexpected GitHub Sync response.");

  const github = payload.github;
  if (
    typeof github.status !== "string" ||
    !syncStatuses.has(github.status as GitHubSyncStatus)
  )
    throw new Error("The API returned an invalid GitHub Sync status.");

  return {
    connected: requiredBoolean(github.connected, "connection state"),
    repository: nullableString(github.repository, "repository"),
    branch: nullableString(github.branch, "branch"),
    sourceFolder: nullableString(github.source_folder, "source folder"),
    dailySync: requiredBoolean(github.daily_sync, "schedule"),
    status: github.status as GitHubSyncStatus,
    lastDeployedCommit: nullableString(
      github.last_deployed_commit,
      "deployed commit",
    ),
    lastCheckAt: nullableTimestamp(github.last_check_at, "last check time"),
    lastSuccessAt: nullableTimestamp(
      github.last_success_at,
      "last successful sync time",
    ),
    failureReason: nullableString(github.failure_reason, "failure reason"),
  };
}

export function parseGitHubSyncResult(payload: unknown): GitHubSyncResult {
  if (
    !isRecord(payload) ||
    (payload.success !== undefined && payload.success !== true) ||
    !isRecord(payload.sync)
  )
    throw new Error("The API returned an unexpected GitHub sync result.");

  const sync = payload.sync;
  if (sync.status !== "success" && sync.status !== "unchanged")
    throw new Error("The API returned an invalid GitHub sync result status.");
  if (typeof sync.deployed_commit !== "string" || !sync.deployed_commit)
    throw new Error("The API returned an invalid deployed commit.");

  return {
    status: sync.status,
    deployedCommit: sync.deployed_commit,
    lastCheckAt: nullableTimestamp(sync.last_check_at, "last check time"),
    lastSuccessAt: nullableTimestamp(
      sync.last_success_at,
      "last successful sync time",
    ),
  };
}

export function validateRepositoryName(value: string): string | null {
  const repository = value.trim();
  const parts = repository.split("/");
  if (
    parts.length !== 2 ||
    parts.some(
      (part) =>
        !part ||
        part.length > 100 ||
        !/^[A-Za-z0-9._-]+$/.test(part) ||
        part === "." ||
        part === "..",
    )
  )
    return "Enter the public GitHub repository as owner/repo.";
  return null;
}

export function validateSourceFolder(value: string): string | null {
  const folder = value.trim();
  if (
    folder &&
    (folder.startsWith("/") ||
      folder.endsWith("/") ||
      folder.includes("\\") ||
      folder.split("/").some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === "..",
      ))
  )
    return "Enter a repository-relative folder without leading or trailing slashes.";
  return null;
}

export const githubSync = {
  status: async (projectId: string) =>
    parseGitHubConnection(
      await api<unknown>("github.status", {}, [projectId]),
    ),
  connect: async (projectId: string, input: GitHubConnectionInput) =>
    parseGitHubConnection(
      await api<unknown>(
        "github.connect",
        {
          method: "PUT",
          body: JSON.stringify(input),
        },
        [projectId],
      ),
    ),
  syncNow: async (projectId: string) =>
    parseGitHubSyncResult(
      await api<unknown>("github.sync", { method: "POST" }, [projectId]),
    ),
  disconnect: async (projectId: string) =>
    parseGitHubConnection(
      await api<unknown>(
        "github.disconnect",
        { method: "DELETE" },
        [projectId],
      ),
    ),
};
