import { api } from "./api";
import type { HostedWebsite, Domain, Deployment } from "../types";
export const websites = {
  list: () => api<HostedWebsite[]>("sites.list"),
  get: (id: string) =>
    api<HostedWebsite>("sites.get", { headers: { "X-Site-Id": id } }),
  create: (name: string) =>
    api<HostedWebsite>("sites.create", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  update: (id: string, name: string) =>
    api<HostedWebsite>("sites.update", {
      method: "PATCH",
      body: JSON.stringify({ id, name }),
    }),
  remove: (id: string) =>
    api<void>("sites.delete", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    }),
  domains: (id: string) =>
    api<Domain[]>("domains.list", { headers: { "X-Site-Id": id } }),
  deployments: (id: string) =>
    api<Deployment[]>("deployments.list", { headers: { "X-Site-Id": id } }),
};
