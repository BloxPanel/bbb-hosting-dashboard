import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Copy, RefreshCw, ShieldOff } from "lucide-react";
import { useApp } from "../app/state";
import { ErrorDisplay } from "../components/ErrorDisplay";
import {
  invitationLink,
  invitations,
  type InvitationMetadata,
} from "../services/invitations";

const DAY = 24 * 60 * 60;

function localDateTime(value: Date): string {
  const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

export default function OwnerInvitations() {
  const { user } = useApp();
  const [rows, setRows] = useState<InvitationMetadata[]>([]);
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState(() =>
    localDateTime(new Date(Date.now() + 7 * DAY * 1000)),
  );
  const [notes, setNotes] = useState("");
  const [createdLink, setCreatedLink] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown | null>(null);
  const [status, setStatus] = useState("");
  const [revokedTesterIds, setRevokedTesterIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const result = await invitations.list(50, cursor ?? undefined);
      setRows(result.invitations);
      setNextCursor(result.next_cursor);
    } catch (error) {
      setFailure(error);
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const expiry = new Date(expiresAt).getTime();
    const expiresInSeconds = Math.floor((expiry - Date.now()) / 1000);
    if (!Number.isFinite(expiresInSeconds) || expiresInSeconds < 3600 || expiresInSeconds > 30 * DAY) {
      setStatus("Choose an expiration between 1 hour and 30 days from now.");
      return;
    }
    setPending(true);
    setFailure(null);
    setStatus("");
    setCreatedLink("");
    try {
      const result = await invitations.create(
        email.trim(),
        expiresInSeconds,
        notes.trim() || undefined,
      );
      setCreatedLink(invitationLink(result.token));
      setEmail("");
      setNotes("");
      setCursors([]);
      setRefreshKey((value) => value + 1);
      setStatus("Invitation created. Copy the link now; its token is shown only once.");
    } catch (error) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  };

  const revokeInvitation = async (id: string) => {
    setPending(true);
    setFailure(null);
    try {
      const updated = await invitations.revoke(id);
      setRows((current) => current.map((row) => row.id === id ? updated : row));
      setStatus("Invitation revoked.");
    } catch (error) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  };

  const revokeTester = async (row: InvitationMetadata) => {
    const userId = row.redeemed_by_user_id;
    if (!userId) return;
    setPending(true);
    setFailure(null);
    try {
      await invitations.revokeTester(userId);
      setRevokedTesterIds((current) =>
        new Set(current).add(userId),
      );
      setStatus("Tester access revoked. The API will deny hosting access on the next request.");
    } catch (error) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  };

  const showStatus = async (id: string) => {
    setFailure(null);
    try {
      const invitation = await invitations.status(id);
      setRows((current) => current.map((row) => row.id === id ? invitation : row));
      setStatus(`Invitation status: ${invitation.status}.`);
    } catch (error) {
      setFailure(error);
    }
  };

  const copyLink = async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopyStatus("Invitation link copied.");
    } catch {
      setCopyStatus("Clipboard unavailable. Select and copy the link below.");
    }
  };

  if (user?.role !== "owner")
    return <p role="alert">This page is available only to the platform owner.</p>;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">CLOSED PRE-ALPHA</span>
          <h1>Invitations</h1>
          <p>Create and manage tester invitations and access.</p>
        </div>
        <button className="secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {failure !== null && (
        <ErrorDisplay
          error={failure}
          context={{
            component: "Authentication",
            operation: "owner.invitations",
            reason: "Request failed",
            retryable: false,
          }}
        />
      )}
      <section className="card owner-invite-form">
        <h2>Create invitation</h2>
        <p>Invitation links are generated once. Share them only with the intended tester.</p>
        <form onSubmit={create}>
          <label>
            Intended email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Expires at (your local time)
            <input
              type="datetime-local"
              value={expiresAt}
              min={localDateTime(new Date(Date.now() + 3600_000))}
              max={localDateTime(new Date(Date.now() + 30 * DAY * 1000))}
              onChange={(event) => setExpiresAt(event.target.value)}
              required
            />
          </label>
          <label>
            Administrative notes <span className="muted">(optional)</span>
            <textarea
              value={notes}
              maxLength={1000}
              rows={3}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <button className="primary" type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create invitation"}
          </button>
        </form>
        {createdLink && (
          <div className="created-invite" aria-label="New invitation link">
            <label htmlFor="created-invite-link">Invitation link — shown once</label>
            <div className="row">
              <input id="created-invite-link" readOnly value={createdLink} onFocus={(event) => event.currentTarget.select()} />
              <button className="secondary" type="button" onClick={copyLink}>
                <Copy size={15} /> Copy link
              </button>
            </div>
            {copyStatus && <p role="status">{copyStatus}</p>}
          </div>
        )}
      </section>
      {status && <p role="status">{status}</p>}
      <section className="card owner-invitations-list">
        <header className="section-heading">
          <div>
            <h2>Existing invitations</h2>
            <p>Invitation tokens and hashes are never shown in this list.</p>
          </div>
        </header>
        {loading ? (
          <p className="file-loading" role="status">Loading invitations…</p>
        ) : rows.length === 0 ? (
          <p className="file-loading">No invitations on this page.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Email</th><th>Status</th><th>Expires</th><th>Created</th><th>Notes</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.intended_email}</td>
                    <td><span className={`badge ${row.status}`}>{row.status}</span></td>
                    <td>{new Date(row.expires_at * 1000).toLocaleString()}</td>
                    <td>{new Date(row.created_at * 1000).toLocaleString()}</td>
                    <td>{row.notes || "—"}</td>
                    <td>
                      <div className="owner-actions">
                        <button className="inline-button" type="button" onClick={() => void showStatus(row.id)}>Refresh status</button>
                        {row.status === "pending" && (
                          <button className="inline-button danger-link" type="button" disabled={pending} onClick={() => void revokeInvitation(row.id)}>
                            Revoke
                          </button>
                        )}
                        {row.status === "redeemed" && row.redeemed_by_user_id && (
                          revokedTesterIds.has(row.redeemed_by_user_id) ? (
                            <span className="muted">Tester access revoked</span>
                          ) : (
                            <button className="inline-button danger-link" type="button" disabled={pending} onClick={() => void revokeTester(row)}>
                              <ShieldOff size={14} /> Revoke tester access
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(cursors.length > 0 || nextCursor) && (
          <div className="file-pagination">
            <button className="secondary" disabled={cursors.length === 0 || loading} onClick={() => setCursors((current) => current.slice(0, -1))}>Previous</button>
            <span>Invitation page</span>
            <button
              className="secondary"
              disabled={!nextCursor || loading}
              onClick={() => {
                if (nextCursor)
                  setCursors((current) => [...current, nextCursor]);
              }}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
