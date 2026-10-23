import { api } from "./api";
import type { UserAccount } from "../types";
export const auth = {
  session: () => api<UserAccount>("auth.session"),
  login: (email: string, password: string) =>
    api<UserAccount>("auth.login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  logout: () => api<void>("auth.logout", { method: "POST" }),
};
