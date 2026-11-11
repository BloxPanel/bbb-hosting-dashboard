import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import {
  invitationLink,
  invitations,
  type InvitationMetadata,
} from "./invitations";

const origin = "https://api.builtbybuzz.dev";
const token = "a".repeat(64);
const invitation: InvitationMetadata = {
  id: "invitation-1",
  intended_email: "tester@example.test",
  created_at: 1794268800,
  expires_at: 1794873600,
  redeemed_at: null,
  revoked_at: null,
  redeemed_by_user_id: null,
  created_by_user_id: "owner-1",
  notes: null,
  status: "pending",
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", origin);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function reply(payload: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    Response.json(payload, { status, headers: { "Cache-Control": "no-store" } }),
  );
}

describe("invitation API client", () => {
  it("validates tokens in a no-store credentialed JSON request", async () => {
    reply({ success: true, valid: true });
    await invitations.validate(token);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${origin}/v1/invitations/validate`);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
    });
    expect(JSON.parse(String(init?.body))).toEqual({ token });
  });

  it("redeems registration-bound invitations without persisting or resending tokens", async () => {
    reply({ success: true, access: "approved" });
    await invitations.redeem();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({});
    expect(init).toMatchObject({ credentials: "include", cache: "no-store" });
  });

  it("creates and returns the one-time token separately from metadata", async () => {
    reply({ success: true, invitation, token });
    const result = await invitations.create(
      invitation.intended_email,
      7 * 24 * 60 * 60,
      "Cohort",
    );
    expect(result).toEqual({ success: true, invitation, token });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      email: invitation.intended_email,
      expires_in_seconds: 604800,
      notes: "Cohort",
    });
    expect(invitationLink(token)).toBe(
      `https://hosting.builtbybuzz.dev/invite#token=${token}`,
    );
  });

  it("lists only invitation metadata and follows cursor pagination", async () => {
    reply({ success: true, invitations: [invitation], next_cursor: "next:cursor" });
    const response = await invitations.list(25, "previous:cursor");
    expect(response.invitations).toEqual([invitation]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `${origin}/v1/owner/invitations?limit=25&cursor=previous%3Acursor`,
    );
    expect(init).toMatchObject({ method: "GET", credentials: "include", cache: "no-store" });
  });

  it("sends no body for owner revoke operations", async () => {
    reply({ success: true, invitation: { ...invitation, status: "revoked" } });
    await invitations.revoke(invitation.id);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${origin}/v1/owner/invitations/${invitation.id}/revoke`);
    expect(init).toMatchObject({ method: "POST", cache: "no-store" });
    expect(init?.body).toBeUndefined();
  });

  it("parses safe invitation error identifiers without reflecting private messages", async () => {
    reply(
      {
        success: false,
        error: "INVITATION_EMAIL_MISMATCH",
        code: 6006,
        message: "This invitation cannot be used with this account.",
      },
      403,
    );
    await expect(invitations.validate(token)).rejects.toMatchObject({
      identifier: "INVITATION_EMAIL_MISMATCH",
      bbbCode: 6006,
      message: "This invitation cannot be used with this account.",
    } satisfies Partial<ApiError>);
  });
});
