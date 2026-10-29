import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  MAX_PROJECT_FILES,
  MAX_STORAGE_BYTES,
  parseFilePage,
  parseStorage,
  validateFilePath,
} from "./files";

describe("project file API contracts", () => {
  it("uses the backend file, storage and quota limits", () => {
    expect(MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_STORAGE_BYTES).toBe(1024 * 1024 * 1024);
    expect(MAX_PROJECT_FILES).toBe(10_000);
    expect(
      parseStorage({
        success: true,
        storage: {
          bytes_used: 1200,
          file_count: 2,
          file_count_limit: 10_000,
          quota_bytes: 1024 * 1024 * 1024,
          percent_used: 0.01,
        },
      }),
    ).toEqual({
      bytesUsed: 1200,
      fileCount: 2,
      fileCountLimit: 10_000,
      quotaBytes: 1024 * 1024 * 1024,
      percentUsed: 0.01,
    });
  });

  it("normalizes the exact paginated listing shape into display files", () => {
    expect(
      parseFilePage(
        {
          success: true,
          files: [
            {
              path: "assets/site.css",
              size: 125,
              content_type: "text/css; charset=utf-8",
              updated_at: "2026-10-29T12:00:00.000Z",
            },
          ],
          next_cursor: "next",
        },
        "project_1",
      ),
    ).toEqual({
      nextCursor: "next",
      files: [
        {
          id: "assets/site.css",
          siteId: "project_1",
          name: "site.css",
          path: "/assets/",
          size: 125,
          kind: "file",
          mime: "text/css; charset=utf-8",
          modified: "2026-10-29T12:00:00.000Z",
        },
      ],
    });
  });

  it.each([
    ["index.html", null],
    ["assets/site.css", null],
    ["assets/My image.webp", null],
    ["package.json", "Use a simple file path"],
    [".env", "Use a simple file path"],
    ["folder/../index.html", "Use a simple file path"],
    ["folder/a..b.txt", "Use a simple file path"],
    ["folder\\index.html", "Use a simple file path"],
    ["index.exe", "file type is not supported"],
    ["Dockerfile", "Use a simple file path"],
    ["assets/_internal.txt", "Use a simple file path"],
  ])("validates backend path and extension rules for %s", (path, expected) => {
    const result = validateFilePath(path);
    if (expected === null) expect(result).toBeNull();
    else expect(result).toContain(expected);
  });

  it("rejects malformed or fabricated API success shapes", () => {
    expect(() => parseFilePage({ files: [] }, "project_1")).toThrow(
      /unexpected file listing/,
    );
    expect(() =>
      parseFilePage(
        {
          success: true,
          files: [
            {
              path: "../private.html",
              size: 1,
              content_type: "text/html",
              updated_at: "2026-10-29",
            },
          ],
          next_cursor: null,
        },
        "project_1",
      ),
    ).toThrow(/invalid metadata/);
    expect(() => parseStorage({ success: true, storage: {} })).toThrow(
      /invalid storage usage/,
    );
  });
});
