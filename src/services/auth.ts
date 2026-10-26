import { api, DEMO } from "./api";
import type { UserAccount } from "../types";

export function parseUser(payload: unknown): UserAccount {
  const root = payload as Record<string, unknown> | null;
  const data = (root?.user ??
    (root?.data as Record<string, unknown>)?.user ??
    root?.data ??
    root) as Record<string, unknown> | null;
  if (
    !data ||
    typeof data.id !== "string" ||
    typeof data.email !== "string" ||
    typeof (data.display_name ?? data.name) !== "string"
  )
    throw new Error("The API returned an unexpected account response.");
  return {
    id: data.id,
    email: data.email,
    name: (data.display_name ?? data.name) as string,
    emailVerified:
      typeof data.email_verified === "boolean"
        ? data.email_verified
        : typeof data.email_verified === "number"
          ? data.email_verified === 1
          : Object.hasOwn(data, "email_verified_at")
            ? Boolean(data.email_verified_at)
            : undefined,
    role: typeof data.role === "string" ? data.role : undefined,
  };
}
const post = (capability: string, body: object = {}) => {
  if (DEMO)
    return Promise.reject(
      new Error("Real authentication is disabled in development demo mode."),
    );
  return api(capability, { body: JSON.stringify(body) });
};
export const auth = {
  session: async () => parseUser(await api("auth.session")),
  login: async (email: string, password: string) =>
    parseUser(await post("auth.login", { email, password })),
  register: (email: string, display_name: string, password: string) =>
    post("auth.register", { email, display_name, password }),
  logout: () => post("auth.logout"),
  verify: (token: string) => post("auth.verify", { token }),
  forgot: (email: string) => post("auth.forgot", { email }),
  reset: (token: string, password: string) =>
    post("auth.reset", { token, password }),
};
export function passwordError(password: string, confirmation: string): string {
  if (Array.from(password).length < 12)
    return "Use at least 12 characters for your password.";
  if (new TextEncoder().encode(password).length > 1024)
    return "Your password must be at most 1,024 UTF-8 bytes.";
  return password !== confirmation ? "Passwords do not match." : "";
}
export function safeDestination(value: unknown): string {
  return typeof value === "string" &&
    /^\/dashboard(?:\/|\?|$)/.test(value) &&
    !/[\\\r\n]/.test(value)
    ? value
    : "/dashboard";
}
