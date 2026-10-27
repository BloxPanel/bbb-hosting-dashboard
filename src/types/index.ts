export type BillingStatus =
  | "draft"
  | "pending_payment"
  | "active"
  | "past_due"
  | "suspended"
  | "canceled";
export interface UserAccount {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  role?: string;
}
export interface HostingEntitlement {
  siteId: string;
  source: "subscription" | "owner_grant" | "none";
  eligible: boolean;
}
export interface HostingSubscription {
  siteId: string;
  status: BillingStatus;
  annualPriceUsd: 10;
  renewalDate?: string;
}
export interface HostedWebsite {
  id: string;
  name: string;
  slug: string;
  url: string;
  publication: "published" | "draft";
  entitlement: HostingEntitlement;
  subscription: HostingSubscription;
  updatedAt: string;
}
export interface HostedProject {
  id: string;
  name: string;
  slug: string;
  url: string;
  hostingStatus: "active" | "inactive";
  createdAt?: string;
}
export interface BillingSummary {
  subscriptions: HostingSubscription[];
  activeSubscriptions: number;
  expectedAnnualBaseCost: number;
}
export interface HostedFile {
  id: string;
  siteId: string;
  name: string;
  path: string;
  size: number;
  kind: "file" | "folder";
  mime: string;
  content?: string;
  dataUrl?: string;
  modified: string;
}
export interface Domain {
  id: string;
  siteId: string;
  hostname: string;
  status: "verified" | "pending";
  assigned: boolean;
}
export interface Deployment {
  id: string;
  siteId: string;
  status: "ready" | "failed" | "building";
  createdAt: string;
  message: string;
}
