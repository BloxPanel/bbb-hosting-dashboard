import { api } from "./api";
import type { HostedProject } from "../types";

type ProjectRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ProjectRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) throw new Error("The API returned an unexpected projects response.");
  if (Array.isArray(payload.projects)) return payload.projects;
  if (Array.isArray(payload.data)) return payload.data;
  if (isRecord(payload.data) && Array.isArray(payload.data.projects))
    return payload.data.projects;
  throw new Error("The API returned an unexpected projects response.");
}

function requiredString(
  project: ProjectRecord,
  fields: string[],
  label: string,
): string {
  const value = fields.map((field) => project[field]).find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  if (!value) throw new Error(`The API returned a project without a valid ${label}.`);
  return value.trim();
}

function normalizeProject(value: unknown): HostedProject {
  if (!isRecord(value))
    throw new Error("The API returned an unexpected project record.");

  const id = requiredString(value, ["id", "project_id"], "ID");
  const name = requiredString(value, ["name", "project_name"], "name");
  const slug = requiredString(value, ["slug"], "subdomain").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug))
    throw new Error("The API returned a project with an invalid subdomain.");

  const rawStatus = value.hosting_status ?? value.status ?? value.active;
  if (typeof rawStatus !== "string" && typeof rawStatus !== "boolean")
    throw new Error("The API returned a project without a valid hosting status.");
  const status =
    typeof rawStatus === "string" ? rawStatus.toLowerCase() : rawStatus;
  if (
    status !== true &&
    status !== false &&
    status !== "active" &&
    status !== "inactive"
  )
    throw new Error("The API returned a project without a valid hosting status.");
  const active = status === true || status === "active";
  const createdAtValue = value.created_at ?? value.createdAt;
  const createdAt =
    typeof createdAtValue === "string" && createdAtValue.trim()
      ? createdAtValue
      : undefined;

  return {
    id,
    name,
    slug,
    url: `https://${slug}.builtbybuzz.dev`,
    hostingStatus: active ? "active" : "inactive",
    createdAt,
  };
}

export function parseProjects(payload: unknown): HostedProject[] {
  return projectList(payload).map(normalizeProject);
}

export const projects = {
  list: async () => parseProjects(await api<unknown>("projects.list")),
};
