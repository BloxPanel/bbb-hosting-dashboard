import { api, apiBlob, apiUpload } from "./api";
import type { HostedFile } from "../types";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_STORAGE_BYTES = 1024 * 1024 * 1024;
export const MAX_PROJECT_FILES = 10_000;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  webmanifest: "application/manifest+json",
  txt: "text/plain",
  md: "text/markdown",
  xml: "application/xml",
  csv: "text/csv",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  pdf: "application/pdf",
  map: "application/json",
  wasm: "application/wasm",
};

const PROTECTED_SEGMENTS = new Set([
  ".env",
  ".git",
  ".htaccess",
  ".user.ini",
  "_routes.json",
  "_worker.js",
  "dockerfile",
  "package-lock.json",
  "package.json",
  "worker.js",
  "wrangler.toml",
  "wrangler.json",
  "wrangler.jsonc",
]);

export interface ProjectFilePage {
  files: HostedFile[];
  nextCursor: string | null;
}

export interface ProjectStorage {
  bytesUsed: number;
  fileCount: number;
  fileCountLimit: number;
  quotaBytes: number;
  percentUsed: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validPath(path: string): boolean {
  if (
    !path ||
    path.length > 1024 ||
    path.includes("\\") ||
    path.includes("%") ||
    Array.from(path).some(
      (character) =>
        character.charCodeAt(0) <= 31 ||
        character.charCodeAt(0) === 127,
    ) ||
    path.normalize("NFC") !== path
  ) {
    return false;
  }

  return path.split("/").every(
    (segment) =>
      segment.length > 0 &&
      segment.length <= 255 &&
      segment !== "." &&
      segment !== ".." &&
      !segment.includes("..") &&
      /^[A-Za-z0-9](?:[A-Za-z0-9._ -]{0,253}[A-Za-z0-9])?$/.test(segment) &&
      !PROTECTED_SEGMENTS.has(segment.toLowerCase()),
  );
}

export function validateFilePath(path: string): string | null {
  if (!validPath(path)) {
    return "Use a simple file path without hidden, reserved, or special segments.";
  }

  const filename = path.slice(path.lastIndexOf("/") + 1);
  const extension = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();

  if (!CONTENT_TYPES[extension]) {
    return "This file type is not supported. Choose an allowed website file type.";
  }

  return null;
}

/**
 * Convert a backend file record into a HostedFile.
 *
 * Validates individual fields and provides diagnostic errors without
 * exposing complete API responses or sensitive metadata.
 */
function parseFile(value: unknown, projectId: string): HostedFile {
  if (!isRecord(value)) {
    throw new Error("The API returned an unexpected file record.");
  }

  const path = value.path;
  const size = value.size;
  const contentType = value.content_type;
  const updatedAt = value.updated_at;

  const problems: string[] = [];

  if (typeof path !== "string") {
    problems.push("path: expected string");
  } else if (!validPath(path)) {
    problems.push(
      `path: failed validation (${JSON.stringify(path)})`
    );
  }

  if (
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 0
  ) {
    problems.push("size: expected non-negative integer");
  }

  if (!(typeof contentType === "string" || contentType === null)) {
    problems.push("content_type: expected string or null");
  }

  if (typeof updatedAt !== "string") {
    problems.push("updated_at: expected date string");
  } else if (Number.isNaN(Date.parse(updatedAt))) {
    problems.push("updated_at: invalid date");
  }

  if (problems.length > 0) {
    throw new Error(
      `The API returned a file with invalid metadata: ${problems.join("; ")}.`,
    );
  }

  // Explicit type narrowing for TypeScript.
  // The diagnostic array above cannot establish these types.
  if (
    typeof path !== "string" ||
    typeof size !== "number" ||
    !(typeof contentType === "string" || contentType === null) ||
    typeof updatedAt !== "string"
  ) {
    throw new Error("The API returned unexpected file metadata types.");
  }

  const slash = path.lastIndexOf("/");

  return {
    id: path,
    siteId: projectId,
    name: path.slice(slash + 1),
    path: slash < 0 ? "/" : `/${path.slice(0, slash + 1)}`,
    size,
    kind: "file",
    mime: contentType ?? "",
    modified: updatedAt,
  };
}

export function parseFilePage(
  payload: unknown,
  projectId: string,
): ProjectFilePage {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    !Array.isArray(payload.files) ||
    !(payload.next_cursor === null || typeof payload.next_cursor === "string")
  ) {
    throw new Error("The API returned an unexpected file listing.");
  }

  return {
    files: payload.files.map((file) => parseFile(file, projectId)),
    nextCursor: payload.next_cursor,
  };
}

export function parseStorage(payload: unknown): ProjectStorage {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    !isRecord(payload.storage)
  ) {
    throw new Error("The API returned an unexpected storage response.");
  }

  const {
    bytes_used,
    file_count,
    file_count_limit,
    quota_bytes,
    percent_used,
  } = payload.storage;

  if (
    !Number.isSafeInteger(bytes_used) ||
    !Number.isSafeInteger(file_count) ||
    !Number.isSafeInteger(file_count_limit) ||
    !Number.isSafeInteger(quota_bytes) ||
    typeof percent_used !== "number" ||
    (bytes_used as number) < 0 ||
    (file_count as number) < 0 ||
    (file_count_limit as number) <= 0 ||
    (quota_bytes as number) <= 0 ||
    percent_used < 0
  ) {
    throw new Error("The API returned invalid storage usage.");
  }

  return {
    bytesUsed: bytes_used as number,
    fileCount: file_count as number,
    fileCountLimit: file_count_limit as number,
    quotaBytes: quota_bytes as number,
    percentUsed: percent_used,
  };
}

function validateUploadResponse(
  payload: unknown,
  path: string,
  size: number,
): void {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    !isRecord(payload.file) ||
    payload.file.path !== path ||
    payload.file.size !== size ||
    typeof payload.file.content_type !== "string"
  ) {
    throw new Error("The API returned an unexpected upload response.");
  }
}

function validateDeleteResponse(
  payload: unknown,
  path: string,
): void {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    payload.deleted !== path
  ) {
    throw new Error("The API returned an unexpected delete response.");
  }
}

export const files = {
  list: async (
    projectId: string,
    cursor: string | null = null,
  ): Promise<ProjectFilePage> => {
    const payload = await api<unknown>(
      "files.list",
      { headers: { Accept: "application/json" } },
      [projectId, "100", cursor || ""],
    );

    return parseFilePage(payload, projectId);
  },

  storage: async (projectId: string): Promise<ProjectStorage> =>
    parseStorage(
      await api<unknown>(
        "files.storage",
        { headers: { Accept: "application/json" } },
        [projectId],
      ),
    ),

  upload: async (
    projectId: string,
    file: File,
    path: string,
    onProgress: (progress: number) => void,
  ): Promise<void> => {
    const result = await apiUpload(
      "files.upload",
      [projectId, path],
      file,
      onProgress,
    );

    validateUploadResponse(result, path, file.size);
  },

  replace: async (
    projectId: string,
    file: File,
    path: string,
    onProgress: (progress: number) => void,
  ): Promise<void> => {
    const result = await apiUpload(
      "files.replace",
      [projectId, path],
      file,
      onProgress,
    );

    validateUploadResponse(result, path, file.size);
  },

  remove: async (
    projectId: string,
    path: string,
  ): Promise<void> => {
    const result = await api<unknown>(
      "files.delete",
      { method: "DELETE" },
      [projectId, path],
    );

    validateDeleteResponse(result, path);
  },

  download: (
    projectId: string,
    path: string,
  ) => apiBlob("files.download", [projectId, path]),
};