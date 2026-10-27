import { describe, expect, it } from "vitest";
import { parseProjects } from "./projects";

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
