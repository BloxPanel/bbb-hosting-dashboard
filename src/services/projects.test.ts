import { describe, expect, it } from "vitest";
import {
  parseProjects,
  validateProjectName,
  validateProjectSlug,
} from "./projects";

describe("project input validation", () => {
  it("requires a website name from 1 to 80 characters", () => {
    expect(validateProjectName("  ")).toMatch(/between 1 and 80/);
    expect(validateProjectName("x".repeat(81))).toMatch(/between 1 and 80/);
    expect(validateProjectName(" My Website ")).toBeNull();
  });

  it("rejects malformed and reserved subdomains", () => {
    expect(validateProjectSlug("bad slug")).toMatch(/1–63 lowercase/);
    expect(validateProjectSlug("www")).toMatch(/reserved/);
    expect(validateProjectSlug("api")).toMatch(/reserved/);
    expect(validateProjectSlug("my-awesome-website")).toBeNull();
  });
});

describe("parseProjects", () => {
  it("maps API project records to website entries without inventing account data", () => {
    expect(
      parseProjects({
        data: {
          projects: [
            {
              id: "proj-1",
              name: "Example Website",
              slug: "example-site",
              status: "Active",
              created_at: "2026-10-12T10:00:00Z",
            },
          ],
        },
      }),
    ).toMatchObject([
      {
        id: "proj-1",
        name: "Example Website",
        slug: "example-site",
        url: "https://example-site.builtbybuzz.dev",
        hostingStatus: "active",
        createdAt: "2026-10-12T10:00:00Z",
      },
    ]);
  });

  it("accepts an empty project list", () => {
    expect(parseProjects({ projects: [] })).toEqual([]);
  });

  it.each([
    null,
    {},
    { projects: [{ id: "missing-fields" }] },
    {
      projects: [
        {
          id: "bad-slug",
          name: "Bad slug",
          slug: "not a domain",
          status: "active",
        },
      ],
    },
    {
      projects: [
        {
          id: "unknown-status",
          name: "Unknown status",
          slug: "unknown-status",
          status: "pending",
        },
      ],
    },
  ])("rejects malformed project data", (payload) => {
    expect(() => parseProjects(payload)).toThrow(/API returned/);
  });
});
