import type { HostedWebsite, HostedFile, Domain, Deployment } from "../types";
export function initialSites(): HostedWebsite[] {
  return [
    ["site_001", "Studio North", "studio-north", "active", "published"],
    ["site_002", "The Field Notes", "field-notes", "active", "published"],
    ["site_003", "Personal Portfolio", "portfolio", "active", "draft"],
    [
      "site_004",
      "A little side project",
      "side-project",
      "pending_payment",
      "draft",
    ],
    ["site_005", "Archive Collective", "archive", "suspended", "draft"],
  ].map(([id, name, slug, status, publication]) => ({
    id,
    name,
    slug,
    url: `https://${slug}.example.com`,
    publication: publication as HostedWebsite["publication"],
    entitlement: {
      siteId: id,
      source: status === "active" ? "subscription" : "none",
      eligible: status === "active",
    },
    subscription: {
      siteId: id,
      status: status as HostedWebsite["subscription"]["status"],
      annualPriceUsd: 10,
      renewalDate: status === "active" ? "2027-10-23" : undefined,
    },
    updatedAt: "2026-10-23",
  }));
}
export const initialFiles = (siteId: string): HostedFile[] => [
  {
    id: "f1",
    siteId,
    name: "assets",
    path: "/",
    size: 0,
    kind: "folder",
    mime: "",
    modified: "2026-10-23",
  },
  {
    id: "f2",
    siteId,
    name: "index.html",
    path: "/",
    size: 128,
    kind: "file",
    mime: "text/html",
    content:
      "<!doctype html>\n<html><body><h1>Hello from your demo website</h1></body></html>",
    modified: "2026-10-23",
  },
  {
    id: "f3",
    siteId,
    name: "styles.css",
    path: "/assets/",
    size: 48,
    kind: "file",
    mime: "text/css",
    content: "body { font-family: system-ui; }",
    modified: "2026-10-23",
  },
];
export const initialDomains = (siteId: string): Domain[] => [
  {
    id: "d1",
    siteId,
    hostname: "studio-north.example.com",
    status: "verified",
    assigned: true,
  },
];
export const initialDeployments = (siteId: string): Deployment[] => [
  {
    id: "deploy_demo_01",
    siteId,
    status: "ready",
    createdAt: "2026-10-23T12:00:00Z",
    message: "Example deployment · initial website files",
  },
];
