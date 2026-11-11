import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  GitBranch,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { useSite } from "./Site";
import { Badge, EmptyState, Modal } from "../components/ui";
import ErrorDisplay from "../components/ErrorDisplay";
import { DEMO } from "../services/api";
import {
  githubSync,
  validateRepositoryName,
  validateSourceFolder,
  type GitHubConnection,
  type GitHubConnectionInput,
} from "../services/githubSync";

type PendingAction = "connect" | "settings" | "sync" | "disconnect" | null;

const STATUS_LABELS: Record<GitHubConnection["status"], string> = {
  disconnected: "Not connected",
  connected: "Connected",
  syncing: "Sync in progress",
  success: "Synced",
  unchanged: "No changes",
  failed: "Sync failed",
  conflict: "Conflict detected",
};

const FAILURE_MESSAGES: Record<string, string> = {
  GITHUB_REQUEST_FAILED: "GitHub could not be reached or returned an error.",
  REPOSITORY_TOO_LARGE: "The repository exceeds the supported sync size.",
  SYNC_CONFLICT:
    "A GitHub file and a built-in editor file were both changed. Resolve the file conflict before retrying.",
  STORAGE_QUOTA_EXCEEDED:
    "This sync would exceed the website's storage quota.",
};

function formatTimestamp(timestamp: number | null): string {
  if (timestamp === null) return "Never";
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(date);
}

function connectionInput(
  repository: string,
  branch: string,
  sourceFolder: string,
  dailySync: boolean,
): GitHubConnectionInput {
  const input: GitHubConnectionInput = {
    repository_url: repository,
    daily_sync: dailySync,
  };
  if (branch.trim()) input.branch = branch.trim();
  if (sourceFolder.trim()) input.source_folder = sourceFolder.trim();
  return input;
}

export default function GitHubSync() {
  const site = useSite();
  if (DEMO)
    return (
      <EmptyState
        title="GitHub Sync is unavailable in the demo workspace"
        description="Connect a real website project to manage its GitHub repository."
      />
    );
  return <GitHubSyncPanel projectId={site.id} />;
}

function GitHubSyncPanel({ projectId }: { projectId: string }) {
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState<unknown | null>(null);
  const [actionError, setActionError] = useState<unknown | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [repositoryInput, setRepositoryInput] = useState("");
  const [branchInput, setBranchInput] = useState("");
  const [sourceFolderInput, setSourceFolderInput] = useState("");
  const [dailySync, setDailySync] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setStatusError(null);
    try {
      const current = await githubSync.status(projectId);
      setConnection(current);
      setBranchInput(current.branch || "");
      setSourceFolderInput(current.sourceFolder || "");
      setDailySync(current.dailySync);
    } catch (error) {
      setStatusError(error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (pending !== "sync") return;
    let active = true;
    let timer: number;
    const pollStatus = async () => {
      try {
        const current = await githubSync.status(projectId);
        if (active) {
          setConnection(current);
          setStatusError(null);
        }
      } catch (error) {
        if (active) setStatusError(error);
      }
      if (active) timer = window.setTimeout(pollStatus, 1500);
    };
    timer = window.setTimeout(pollStatus, 800);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [pending, projectId]);

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const repository = repositoryInput.trim();
    const repositoryError = validateRepositoryName(repository);
    const folderError = validateSourceFolder(sourceFolderInput);
    if (repositoryError || folderError) {
      setFieldError(repositoryError || folderError || "");
      return;
    }
    setFieldError("");
    setActionError(null);
    setPending("connect");
    try {
      const next = await githubSync.connect(
        projectId,
        connectionInput(
          `https://github.com/${repository}`,
          branchInput,
          sourceFolderInput,
          dailySync,
        ),
      );
      setConnection(next);
      setBranchInput(next.branch || "");
      setSourceFolderInput(next.sourceFolder || "");
      setDailySync(next.dailySync);
      setRepositoryInput("");
    } catch (error) {
      setActionError(error);
    } finally {
      setPending(null);
    }
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!connection?.repository) return;
    const folderError = validateSourceFolder(sourceFolderInput);
    if (folderError) {
      setFieldError(folderError);
      return;
    }
    if (!branchInput.trim()) {
      setFieldError("Enter the branch to synchronize.");
      return;
    }
    setFieldError("");
    setActionError(null);
    setPending("settings");
    try {
      setConnection(
        await githubSync.connect(
          projectId,
          connectionInput(
            connection.repository,
            branchInput,
            sourceFolderInput,
            dailySync,
          ),
        ),
      );
    } catch (error) {
      setActionError(error);
    } finally {
      setPending(null);
    }
  };

  const syncNow = async () => {
    setActionError(null);
    setPending("sync");
    try {
      const result = await githubSync.syncNow(projectId);
      setConnection((current) =>
        current
          ? {
              ...current,
              status: result.status,
              lastDeployedCommit: result.deployedCommit,
              lastCheckAt: result.lastCheckAt,
              lastSuccessAt: result.lastSuccessAt,
              failureReason: null,
            }
          : current,
      );
    } catch (error) {
      setActionError(error);
      try {
        setConnection(await githubSync.status(projectId));
      } catch (statusFailure) {
        setStatusError(statusFailure);
      }
    } finally {
      setPending(null);
    }
  };

  const disconnect = async () => {
    setActionError(null);
    setPending("disconnect");
    try {
      setConnection(await githubSync.disconnect(projectId));
      setBranchInput("");
      setSourceFolderInput("");
      setDailySync(false);
      setConfirmDisconnect(false);
    } catch (error) {
      setActionError(error);
    } finally {
      setPending(null);
    }
  };

  const busy = pending !== null;
  const connected = connection?.connected === true;
  const failureMessage = connection?.failureReason
    ? FAILURE_MESSAGES[connection.failureReason] ||
      `The last sync failed (${connection.failureReason.replaceAll("_", " ").toLowerCase()}).`
    : null;

  return (
    <section className="card padded github-sync-panel">
      <div className="github-sync-heading">
        <div className="github-sync-title">
          <GitBranch className="cyan" size={22} />
          <div>
            <h2>GitHub Sync</h2>
            <p>
              Publish static website files from a public GitHub repository.
            </p>
          </div>
        </div>
        <button
          className="secondary github-sync-refresh"
          type="button"
          onClick={() => void refreshStatus()}
          disabled={loading || busy}
        >
          <RefreshCw size={15} />
          Refresh status
        </button>
      </div>

      <div className="warning github-conflict-warning" role="note">
        <AlertTriangle size={18} />
        <div>
          <strong>Editor and GitHub files can conflict.</strong>
          <p>
            If the same file changes in GitHub and BBB’s built-in editor, sync
            stops without publishing a partial update. Preserve any local edit
            under another path, delete the conflicting managed file in the file
            manager, then retry. Disconnecting keeps the currently deployed
            files.
          </p>
        </div>
      </div>

      {actionError !== null && (
        <div className="github-sync-error">
          <ErrorDisplay error={actionError} title="GitHub Sync" />
        </div>
      )}
      {statusError !== null && (
        <div className="github-sync-error">
          <ErrorDisplay error={statusError} title="GitHub Sync status" />
        </div>
      )}

      {loading ? (
        <div className="github-sync-loading" role="status">
          Loading GitHub Sync status…
        </div>
      ) : connection ? (
        connected ? (
          <>
            <div className="github-sync-status-row">
              <div className="github-sync-status">
                <span>Synchronization status</span>
                <Badge
                  value={connection.status}
                  label={STATUS_LABELS[connection.status]}
                />
              </div>
              <span className="github-sync-mode">
                {connection.dailySync
                  ? "Daily synchronization enabled"
                  : "Manual synchronization only"}
              </span>
            </div>

            {failureMessage && (
              <div
                className={`github-sync-failure ${connection.status === "conflict" ? "conflict" : ""}`}
                role="status"
              >
                {failureMessage}
              </div>
            )}

            {(pending === "sync" || connection.status === "syncing") && (
              <div className="github-sync-progress" role="status">
                <span>Checking the repository and preparing website files…</span>
                <progress aria-label="GitHub synchronization in progress" />
                <small>
                  The API reports synchronization state, not per-file percentage.
                </small>
              </div>
            )}

            <dl className="github-sync-details">
              <div>
                <dt>Public repository</dt>
                <dd className="github-sync-value">{connection.repository}</dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>{connection.branch || "Repository default"}</dd>
              </div>
              <div>
                <dt>Website source folder</dt>
                <dd>{connection.sourceFolder || "Repository root"}</dd>
              </div>
              <div>
                <dt>Last deployed commit</dt>
                <dd className="github-sync-commit">
                  {connection.lastDeployedCommit || "No commit deployed yet"}
                </dd>
              </div>
              <div>
                <dt>Last synchronization</dt>
                <dd>{formatTimestamp(connection.lastSuccessAt)}</dd>
              </div>
              <div>
                <dt>Last repository check</dt>
                <dd>{formatTimestamp(connection.lastCheckAt)}</dd>
              </div>
            </dl>

            <form className="github-sync-form" onSubmit={(event) => void saveSettings(event)}>
              <label>
                Branch name
                <input
                  value={branchInput}
                  onChange={(event) => setBranchInput(event.currentTarget.value)}
                  required
                  maxLength={255}
                  disabled={busy}
                />
                <small>
                  Enter a branch name; the API verifies it against the repository.
                </small>
              </label>
              <label>
                Website source folder
                <input
                  value={sourceFolderInput}
                  onChange={(event) => setSourceFolderInput(event.currentTarget.value)}
                  placeholder="Repository root"
                  maxLength={1024}
                  disabled={busy}
                />
                <small>
                  Optional repository-relative folder; leave blank to use the root.
                </small>
              </label>
              <label className="github-sync-checkbox github-sync-wide">
                <input
                  type="checkbox"
                  checked={dailySync}
                  onChange={(event) => setDailySync(event.currentTarget.checked)}
                  disabled={busy}
                />
                <span>
                  Enable daily synchronization
                  <small>
                    Off means manual-only. Daily checks deploy static files; they
                    do not run builds or install packages.
                  </small>
                </span>
              </label>
              {fieldError && (
                <p className="form-error github-sync-wide" role="alert">
                  {fieldError}
                </p>
              )}
              <div className="github-sync-actions github-sync-wide">
                <button className="primary" type="submit" disabled={busy}>
                  {pending === "settings" ? "Saving…" : "Save settings"}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void syncNow()}
                  disabled={busy}
                >
                  <RefreshCw size={15} />
                  {pending === "sync" ? "Syncing…" : "Sync Now"}
                </button>
                <button
                  className="danger github-sync-disconnect"
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={busy}
                >
                  <Unlink size={15} />
                  Disconnect
                </button>
              </div>
            </form>
          </>
        ) : (
          <form className="github-sync-form" onSubmit={(event) => void connect(event)}>
            <p className="github-sync-intro github-sync-wide">
              Connect a public repository using its <code>owner/repo</code> name.
              Private repositories, build commands, and package installation are
              not supported.
            </p>
            <label>
              Public repository
              <input
                value={repositoryInput}
                onChange={(event) =>
                  setRepositoryInput(event.currentTarget.value)
                }
                placeholder="owner/repo"
                autoComplete="off"
                required
                maxLength={202}
                disabled={busy}
              />
            </label>
            <label>
              Branch name
              <input
                value={branchInput}
                onChange={(event) => setBranchInput(event.currentTarget.value)}
                placeholder="Use the repository default"
                maxLength={255}
                disabled={busy}
              />
              <small>
                Enter a branch name, or leave blank for the repository default.
                The API verifies the branch.
              </small>
            </label>
            <label>
              Website source folder
              <input
                value={sourceFolderInput}
                onChange={(event) => setSourceFolderInput(event.currentTarget.value)}
                placeholder="Repository root"
                maxLength={1024}
                disabled={busy}
              />
              <small>
                Optional repository-relative folder; leave blank to use the root.
              </small>
            </label>
            <label className="github-sync-checkbox">
              <input
                type="checkbox"
                checked={dailySync}
                onChange={(event) => setDailySync(event.currentTarget.checked)}
                disabled={busy}
              />
              <span>
                Enable daily synchronization
                <small>
                  Off means manual-only. Daily checks publish static files and
                  do not run builds or install packages.
                </small>
              </span>
            </label>
            {fieldError && (
              <p className="form-error github-sync-wide" role="alert">
                {fieldError}
              </p>
            )}
            <div className="github-sync-actions github-sync-wide">
              <button className="primary" type="submit" disabled={busy}>
                {pending === "connect" ? "Connecting…" : "Connect repository"}
              </button>
            </div>
          </form>
        )
      ) : null}

      {pending === "sync" && !connected && (
        <div className="github-sync-progress" role="status">
          Checking the repository…
          <progress aria-label="GitHub synchronization in progress" />
        </div>
      )}

      {confirmDisconnect && (
        <Modal
          title="Disconnect GitHub repository?"
          onClose={() => {
            if (!busy) setConfirmDisconnect(false);
          }}
          closeDisabled={busy}
        >
          <p>
            Future GitHub checks will stop. The files currently deployed to this
            website will remain live and editable.
          </p>
          <div className="modal-actions">
            <button
              className="secondary"
              type="button"
              onClick={() => setConfirmDisconnect(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="danger"
              type="button"
              onClick={() => void disconnect()}
              disabled={busy}
            >
              {pending === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
