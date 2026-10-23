import { describe, expect, it } from "vitest";
import { demoEnabled, api, IntegrationUnavailable } from "./api";
import { initialSites } from "./demo";
import { summarize } from "./billing";
describe("demo boundary", () => {
  it("requires development and an explicit true value", () => {
    expect(demoEnabled(true, "true")).toBe(true);
    for (const value of ["true", "false", undefined])
      expect(demoEnabled(false, value)).toBe(false);
    expect(demoEnabled(true, undefined)).toBe(false);
    expect(demoEnabled(true, "false")).toBe(false);
  });
  it("rejects unknown endpoints rather than inventing a response", async () => {
    await expect(api("unconfirmed.endpoint")).rejects.toBeInstanceOf(
      IntegrationUnavailable,
    );
  });
});
describe("per website hosting", () => {
  it("counts only active subscriptions at $10 each", () => {
    const sites = initialSites();
    const summary = summarize(sites.map((s) => s.subscription));
    expect(summary.activeSubscriptions).toBe(3);
    expect(summary.expectedAnnualBaseCost).toBe(30);
  });
  it("canceling one subscription leaves another untouched", () => {
    const sites = initialSites();
    sites[0].subscription.status = "canceled";
    expect(sites[1].subscription.status).toBe("active");
    expect(
      summarize(sites.map((s) => s.subscription)).expectedAnnualBaseCost,
    ).toBe(20);
  });
  it("keeps an unpaid website ineligible alongside paid websites", () => {
    const sites = initialSites();
    expect(sites[0].entitlement.eligible).toBe(true);
    expect(sites[3].entitlement.eligible).toBe(false);
    expect(sites[3].entitlement.siteId).toBe(sites[3].id);
  });
  it("keeps publication independent from active billing", () => {
    const site = initialSites()[2];
    expect(site.subscription.status).toBe("active");
    expect(site.publication).toBe("draft");
  });
});
