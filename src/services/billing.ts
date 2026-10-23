import { api } from "./api";
import type {
  BillingSummary,
  HostingEntitlement,
  HostingSubscription,
} from "../types";
export const summarize = (
  subscriptions: HostingSubscription[],
): BillingSummary => {
  const activeSubscriptions = subscriptions.filter(
    (s) => s.status === "active",
  ).length;
  return {
    subscriptions,
    activeSubscriptions,
    expectedAnnualBaseCost: activeSubscriptions * 10,
  };
};
export const billing = {
  summary: () => api<BillingSummary>("billing.summary"),
  site: (id: string) =>
    api<HostingSubscription>("billing.site", { headers: { "X-Site-Id": id } }),
  entitlement: (id: string) =>
    api<HostingEntitlement>("billing.entitlement", {
      headers: { "X-Site-Id": id },
    }),
  checkout: (projectId: string, bearerToken: string) => {
    if (!projectId.trim())
      return Promise.reject(new Error("Checkout requires a project_id."));
    return api("billing.checkout", {
      method: "POST",
      bearerToken,
      body: JSON.stringify({ project_id: projectId }),
    });
  },
  portal: (siteId: string) =>
    api<{ url: string }>("billing.portal", {
      method: "POST",
      body: JSON.stringify({ siteId }),
    }),
};
