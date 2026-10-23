import { api } from "./api";
// Payload schemas are not yet documented. Preserve the actual response rather than inventing fields.
export const connectivity = {
  info: () => api("api.info"),
  health: () => api("api.health"),
  projectCount: () => api("api.projectCount"),
};
