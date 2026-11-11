import { api } from "./api";

export interface InvitationMetadata {
  id: string;
  intended_email: string;
  created_at: number;
  expires_at: number;
  redeemed_at: number | null;
  revoked_at: number | null;
  redeemed_by_user_id: string | null;
  created_by_user_id: string;
  notes: string | null;
  status: "pending" | "expired" | "revoked" | "redeemed";
}

interface InvitationListResponse {
  success: true;
  invitations: InvitationMetadata[];
  next_cursor: string | null;
}

interface InvitationResponse {
  success: true;
  invitation: InvitationMetadata;
}

let inviteToken = "";

export function captureInvitationToken() {
  if (window.location.pathname !== "/invite" || !window.location.hash) return;
  inviteToken =
    new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search,
  );
}

export function getInvitationToken(): string {
  return inviteToken;
}

export function clearInvitationToken() {
  inviteToken = "";
}

function isInvitationMetadata(value: unknown): value is InvitationMetadata {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.intended_email === "string" &&
    typeof item.created_at === "number" &&
    typeof item.expires_at === "number" &&
    (item.redeemed_at === null || typeof item.redeemed_at === "number") &&
    (item.revoked_at === null || typeof item.revoked_at === "number") &&
    (item.redeemed_by_user_id === null ||
      typeof item.redeemed_by_user_id === "string") &&
    typeof item.created_by_user_id === "string" &&
    (item.notes === null || typeof item.notes === "string") &&
    ["pending", "expired", "revoked", "redeemed"].includes(
      String(item.status),
    )
  );
}

function parseInvitationResponse(value: unknown): InvitationResponse {
  if (
    !value ||
    typeof value !== "object" ||
    !("success" in value) ||
    value.success !== true ||
    !("invitation" in value) ||
    !isInvitationMetadata(value.invitation)
  )
    throw new Error("The API returned an unexpected invitation response.");
  return value as InvitationResponse;
}

export const invitations = {
  validate: async (token: string) => {
    const response = await api<{ success: true; valid: true }>(
      "invitations.validate",
      { body: JSON.stringify({ token }) },
    );
    if (response?.success !== true || response.valid !== true)
      throw new Error("The API returned an unexpected invitation response.");
  },
  redeem: async (token?: string) => {
    const response = await api<unknown>("invitations.redeem", {
      body: JSON.stringify(token ? { token } : {}),
    });
    if (
      !response ||
      typeof response !== "object" ||
      !("success" in response) ||
      response.success !== true ||
      !("access" in response) ||
      response.access !== "approved"
    )
      throw new Error("The API returned an unexpected redemption response.");
  },
  list: async (limit = 50, cursor?: string) => {
    const response = await api<InvitationListResponse>(
      "owner.invitations.list",
      {},
      [String(limit), cursor ?? ""],
    );
    if (
      response?.success !== true ||
      !Array.isArray(response.invitations) ||
      !response.invitations.every(isInvitationMetadata) ||
      !(response.next_cursor === null ||
        typeof response.next_cursor === "string")
    )
      throw new Error("The API returned an unexpected invitation list.");
    return response;
  },
  create: async (
    email: string,
    expiresInSeconds: number,
    notes?: string,
  ) => {
    const response = await api<InvitationResponse & { token: string }>(
      "owner.invitations.create",
      {
        body: JSON.stringify({
          email,
          expires_in_seconds: expiresInSeconds,
          ...(notes ? { notes } : {}),
        }),
      },
    );
    const parsed = parseInvitationResponse(response);
    if (typeof response.token !== "string" || !/^[a-f0-9]{64}$/.test(response.token))
      throw new Error("The API returned an unexpected invitation response.");
    return { ...parsed, token: response.token };
  },
  status: async (id: string) =>
    parseInvitationResponse(
      await api("owner.invitations.status", {}, [id]),
    ).invitation,
  revoke: async (id: string) =>
    parseInvitationResponse(
      await api("owner.invitations.revoke", {}, [id]),
    ).invitation,
  revokeTester: async (userId: string) => {
    const response = await api<unknown>(
      "owner.testers.revoke",
      {},
      [userId],
    );
    if (
      !response ||
      typeof response !== "object" ||
      !("success" in response) ||
      response.success !== true ||
      !("user_id" in response) ||
      response.user_id !== userId ||
      !("access" in response) ||
      response.access !== "revoked"
    )
      throw new Error("The API returned an unexpected tester access response.");
  },
};

export function invitationLink(token: string): string {
  return `https://hosting.builtbybuzz.dev/invite#token=${encodeURIComponent(token)}`;
}
