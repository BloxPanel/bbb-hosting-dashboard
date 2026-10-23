import { api } from "./api";
import type { HostedFile } from "../types";
export const files = {
  list: (siteId: string, path: string) =>
    api<HostedFile[]>("files.list", {
      headers: { "X-Site-Id": siteId, "X-Directory": path },
    }),
  upload: (siteId: string, file: File, path: string) => {
    const data = new FormData();
    data.set("siteId", siteId);
    data.set("path", path);
    data.set("file", file);
    return api<HostedFile>("files.upload", { method: "POST", body: data });
  },
  rename: (siteId: string, id: string, name: string) =>
    api<void>("files.rename", {
      method: "PATCH",
      body: JSON.stringify({ siteId, id, name }),
    }),
  remove: (siteId: string, id: string) =>
    api<void>("files.delete", {
      method: "DELETE",
      body: JSON.stringify({ siteId, id }),
    }),
  download: (siteId: string, id: string) =>
    api<{ url: string }>("files.download", {
      headers: { "X-Site-Id": siteId, "X-File-Id": id },
    }),
};
