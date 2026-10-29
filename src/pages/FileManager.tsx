import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  Eye,
  FileText,
  Folder,
  Image,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useSite } from "./Site";
import { useApp } from "../app/state";
import { initialFiles } from "../services/demo";
import { DEMO } from "../services/api";
import {
  files as fileApi,
  MAX_FILE_BYTES,
  MAX_PROJECT_FILES,
  MAX_STORAGE_BYTES,
  validateFilePath,
  type ProjectStorage,
} from "../services/files";
import { EmptyState, Modal } from "../components/ui";
import type { HostedFile } from "../types";

const DEMO_MAX_FILE_BYTES = 5 * 1024 * 1024;
const TEXT_PREVIEW_EXTENSIONS = new Set([
  "css",
  "csv",
  "htm",
  "html",
  "js",
  "json",
  "map",
  "md",
  "mjs",
  "txt",
  "webmanifest",
  "xml",
]);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function objectPath(file: HostedFile): string {
  if (file.kind === "folder") return "";
  return `${file.path === "/" ? "" : file.path.slice(1)}${file.name}`;
}

function fileDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function makeDemoFile(siteId: string, file: File, path: string): Promise<HostedFile> {
  const extension = file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
  const mime = file.type || "application/octet-stream";
  const isText = TEXT_PREVIEW_EXTENSIONS.has(extension) || extension === "svg";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const slash = path.lastIndexOf("/");
      resolve({
        id: path,
        siteId,
        name: path.slice(slash + 1),
        path: slash < 0 ? "/" : `/${path.slice(0, slash + 1)}`,
        size: file.size,
        kind: "file",
        mime,
        content: isText ? String(reader.result) : undefined,
        dataUrl: isText ? undefined : String(reader.result),
        modified: new Date().toISOString(),
      });
    };
    reader.onerror = () => reject(new Error("Unable to read the selected file."));
    if (isText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

export default function FileManager() {
  const site = useSite();
  const { setNotice, siteFiles, setSiteFiles } = useApp();
  const demoFiles = siteFiles[site.id] ?? (DEMO ? initialFiles(site.id) : []);
  const [remoteFiles, setRemoteFiles] = useState<HostedFile[]>([]);
  const [path, setPath] = useState("/");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(!DEMO);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [storage, setStorage] = useState<ProjectStorage | null>(null);
  const [storageError, setStorageError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [progress, setProgress] = useState<{
    name: string;
    percent: number;
    item: number;
    total: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [preview, setPreview] = useState<HostedFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleting, setDeleting] = useState<HostedFile | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<HostedFile | null>(null);

  useEffect(() => {
    if (DEMO) return;
    let active = true;
    setLoading(true);
    setError("");
    setStorageError("");
    setRemoteFiles([]);
    setCursor(null);
    setHasMore(false);
    setStorage(null);
    Promise.allSettled([fileApi.list(site.id), fileApi.storage(site.id)])
      .then(([pageResult, storageResult]) => {
        if (!active) return;
        if (pageResult.status === "fulfilled") {
          setRemoteFiles(pageResult.value.files);
          setCursor(pageResult.value.nextCursor);
          setHasMore(pageResult.value.nextCursor !== null);
        } else {
          setError(
            pageResult.reason instanceof Error
              ? pageResult.reason.message
              : "Could not load this website's files.",
          );
        }
        if (storageResult.status === "fulfilled") {
          setStorage(storageResult.value);
        } else {
          setStorageError(
            storageResult.reason instanceof Error
              ? storageResult.reason.message
              : "Could not load storage usage.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [site.id, refreshKey]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const sourceFiles = DEMO ? demoFiles : remoteFiles;
  const directoryFiles = useMemo(() => {
    const direct = new Map<string, HostedFile>();
    for (const file of sourceFiles) {
      if (file.kind === "folder") {
        if (file.path === path)
          direct.set(
            `folder:${path === "/" ? "" : path.slice(1)}${file.name}/`,
            file,
          );
        continue;
      }
      if (file.path === path) {
        direct.set(file.id, file);
        continue;
      }
      const base = path === "/" ? "" : path.slice(1);
      const relative =
        file.path === "/"
          ? ""
          : file.path.startsWith(path)
            ? file.path.slice(path.length)
            : "";
      const remaining =
        file.path === path || !file.path.startsWith(path)
          ? ""
          : `${relative}${file.name}`;
      if (!remaining) continue;
      const slash = remaining.indexOf("/");
      if (slash < 0) continue;
      const folderName = remaining.slice(0, slash);
      const folderPath = `${base}${folderName}/`;
      direct.set(`folder:${folderPath}`, {
        id: `folder:${folderPath}`,
        siteId: site.id,
        name: folderName,
        path,
        size: 0,
        kind: "folder",
        mime: "",
        modified: file.modified,
      });
    }
    return Array.from(direct.values()).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [path, site.id, sourceFiles]);

  const usedStorage = storage?.bytesUsed ??
    (DEMO ? demoFiles.reduce((sum, file) => sum + (file.kind === "file" ? file.size : 0), 0) : 0);
  const fileCount = storage?.fileCount ??
    (DEMO ? demoFiles.filter((file) => file.kind === "file").length : 0);
  const storageQuota = storage?.quotaBytes ?? MAX_STORAGE_BYTES;
  const storagePercent = storage?.percentUsed ??
    Math.min(100, (usedStorage / storageQuota) * 100);
  const mutationUnavailable = !DEMO && (loading || !storage || Boolean(storageError));

  function refresh() {
    if (!DEMO) setRefreshKey((key) => key + 1);
  }

  async function loadMore() {
    if (DEMO || !cursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await fileApi.list(site.id, cursor);
      setRemoteFiles((current) => {
        const entries = new Map(current.map((file) => [file.id, file]));
        page.files.forEach((file) => entries.set(file.id, file));
        return Array.from(entries.values());
      });
      setCursor(page.nextCursor);
      setHasMore(page.nextCursor !== null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load more files.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  function validationError(file: File, target?: HostedFile): string | null {
    const sizeLimit = DEMO ? DEMO_MAX_FILE_BYTES : MAX_FILE_BYTES;
    if (file.size > sizeLimit)
      return `Files must be ${formatBytes(sizeLimit)} or smaller.`;
    const fullPath = target
      ? objectPath(target)
      : `${path === "/" ? "" : path.slice(1)}${file.name}`;
    const pathError = validateFilePath(fullPath);
    if (pathError) return pathError;
    if (!DEMO && !storage)
      return "Storage usage is not available yet. Refresh the file list and try again.";
    return null;
  }

  async function upload(selected: FileList | null) {
    if (!selected || selected.length === 0 || busyRef.current) return;
    const chosen = Array.from(selected);
    const target = replaceTarget.current;
    replaceTarget.current = null;
    if (target && chosen.length !== 1) {
      setNotice("Choose one file to replace the selected item.");
      return;
    }
    const invalid = chosen
      .map((file) => validationError(file, target || undefined))
      .find(Boolean);
    if (invalid) {
      setNotice(invalid);
      if (input.current) input.current.value = "";
      return;
    }
    const targetPaths = chosen.map((file) =>
      target
        ? objectPath(target)
        : `${path === "/" ? "" : path.slice(1)}${file.name}`,
    );
    if (new Set(targetPaths).size !== targetPaths.length) {
      setNotice("The selected files contain duplicate names in this folder.");
      if (input.current) input.current.value = "";
      return;
    }
    if (
      !target &&
      sourceFiles.some(
        (entry) =>
          entry.kind === "file" && targetPaths.includes(objectPath(entry)),
      )
    ) {
      setNotice("A file with that name already exists. Choose Replace to overwrite it.");
      if (input.current) input.current.value = "";
      return;
    }
    const currentBytes =
      storage?.bytesUsed ??
      demoFiles.reduce(
        (sum, entry) => sum + (entry.kind === "file" ? entry.size : 0),
        0,
      );
    const currentCount =
      storage?.fileCount ??
      demoFiles.filter((entry) => entry.kind === "file").length;
    const existingBytes = target?.size ?? 0;
    const requestedBytes = chosen.reduce((sum, file) => sum + file.size, 0);
    if (currentBytes - existingBytes + requestedBytes > storageQuota) {
      setNotice(
        `This upload would exceed the ${formatBytes(storageQuota)} storage quota.`,
      );
      if (input.current) input.current.value = "";
      return;
    }
    const fileLimit = storage?.fileCountLimit ?? MAX_PROJECT_FILES;
    if (!target && currentCount + chosen.length > fileLimit) {
      setNotice(`This website has reached its ${fileLimit.toLocaleString()}-file limit.`);
      if (input.current) input.current.value = "";
      return;
    }
    busyRef.current = true;
    setBusy(true);
    let changed = false;
    try {
      for (let index = 0; index < chosen.length; index += 1) {
        const file = chosen[index];
        const targetPath = targetPaths[index];
        setProgress({
          name: file.name,
          percent: 0,
          item: index + 1,
          total: chosen.length,
        });
        if (DEMO) {
          setProgress({ name: file.name, percent: 5, item: index + 1, total: chosen.length });
          const created = await makeDemoFile(site.id, file, targetPath);
          setSiteFiles((current) => {
            const existing = current[site.id] ?? initialFiles(site.id);
            return {
              ...current,
              [site.id]: target
                ? existing.map((entry) =>
                    entry.kind === "file" && objectPath(entry) === targetPath
                      ? { ...created, id: entry.id }
                      : entry,
                  )
                : [...existing, created],
            };
          });
          setProgress({ name: file.name, percent: 100, item: index + 1, total: chosen.length });
        } else {
          const onProgress = (percent: number) =>
            setProgress({ name: file.name, percent, item: index + 1, total: chosen.length });
          if (target) await fileApi.replace(site.id, file, targetPath, onProgress);
          else await fileApi.upload(site.id, file, targetPath, onProgress);
          changed = true;
        }
      }
      setNotice(
        DEMO
          ? "Files were added to local demo memory only. Nothing was uploaded."
          : target
            ? "File replaced. This does not publish or deploy your website."
            : "Upload complete. This does not publish or deploy your website.",
      );
    } catch (requestError) {
      setNotice(
        requestError instanceof Error
          ? requestError.message
          : "The upload could not be completed.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress(null);
      if (input.current) input.current.value = "";
      if (changed) refresh();
    }
  }

  async function download(file: HostedFile) {
    if (DEMO) {
      const url = file.dataUrl
        ? file.dataUrl
        : URL.createObjectURL(
            new Blob([file.content || ""], { type: file.mime || "text/plain" }),
          );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      if (!file.dataUrl) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    try {
      const result = await fileApi.download(site.id, objectPath(file));
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setNotice(
        requestError instanceof Error
          ? requestError.message
          : "Could not download this file.",
      );
    }
  }

  async function openPreview(file: HostedFile) {
    setPreview(file);
    setPreviewUrl("");
    setPreviewContent("");
    setPreviewError("");
    const extension = file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
    const isText = TEXT_PREVIEW_EXTENSIONS.has(extension);
    const isImage = file.mime.startsWith("image/") && extension !== "svg";
    if (!isText && !isImage) {
      setPreviewError("Preview is not available for this file type. You can still download it.");
      return;
    }
    if (DEMO) {
      if (isImage && file.dataUrl) setPreviewUrl(file.dataUrl);
      else if (isText && file.content !== undefined) setPreviewContent(file.content);
      else setPreviewError("Preview content is not available in this demo file.");
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await fileApi.download(site.id, objectPath(file));
      if (isImage) setPreviewUrl(URL.createObjectURL(result.blob));
      else setPreviewContent(await result.blob.text());
    } catch (requestError) {
      setPreviewError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load the file preview.",
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleting || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setDeleteError("");
    try {
      if (DEMO) {
        const prefix = `${deleting.path === "/" ? "" : deleting.path.slice(1)}${deleting.name}/`;
        setSiteFiles((current) => ({
          ...current,
          [site.id]: (current[site.id] ?? initialFiles(site.id)).filter(
            (entry) =>
              entry.id !== deleting.id &&
              !(deleting.kind === "folder" && objectPath(entry).startsWith(prefix)),
          ),
        }));
      } else {
        await fileApi.remove(site.id, objectPath(deleting));
        refresh();
      }
      setDeleting(null);
      setNotice(
        DEMO
          ? "Item removed from this local demo only."
          : "File deleted. Your website was not published or deployed.",
      );
    } catch (requestError) {
      setDeleteError(
        requestError instanceof Error
          ? requestError.message
          : "Could not delete this file.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const folderPath = (name: string) => `${path}${name}/`;

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>File manager</h2>
          <p>Manage the files stored for this website.</p>
        </div>
        <button
          className="primary"
          disabled={busy || mutationUnavailable}
          onClick={() => {
            replaceTarget.current = null;
            if (input.current) input.current.multiple = true;
            input.current?.click();
          }}
        >
          <Upload size={16} />
          Upload files
        </button>
      </div>

      <input
        ref={input}
        className="sr-only"
        type="file"
        multiple={!replaceTarget.current}
        onChange={(event) => void upload(event.currentTarget.files)}
        aria-label="Choose files to upload"
        tabIndex={-1}
      />

      <section
        className={`dropzone ${dragging ? "dragging" : ""}`}
        aria-label="File upload drop area"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          replaceTarget.current = null;
          if (input.current) input.current.multiple = true;
          void upload(event.dataTransfer.files);
        }}
      >
        <Upload size={26} />
        <h3>Drop website files here</h3>
        <p>
          or{" "}
          <button
            className="inline-button"
            disabled={busy || mutationUnavailable}
            onClick={() => {
              replaceTarget.current = null;
              if (input.current) input.current.multiple = true;
              input.current?.click();
            }}
          >
            browse files
          </button>{" "}
          · Up to {formatBytes(DEMO ? DEMO_MAX_FILE_BYTES : MAX_FILE_BYTES)} per file
        </p>
        {progress && (
          <div className="upload-progress" role="status">
            <label htmlFor="file-upload-progress">
              Uploading {progress.name} ({progress.item} of {progress.total}) · {progress.percent}%
            </label>
            <progress
              id="file-upload-progress"
              max={100}
              value={progress.percent}
            />
          </div>
        )}
      </section>

      <section className="card storage-card" aria-label="Storage usage">
        <div className="row between">
          <div>
            <h3>Storage</h3>
            <p>
              {formatBytes(usedStorage)} of {formatBytes(storageQuota)} used
            </p>
          </div>
          <span className="muted">
            {fileCount.toLocaleString()} / {(storage?.fileCountLimit ?? MAX_PROJECT_FILES).toLocaleString()} files
          </span>
        </div>
        <progress
          aria-label="Storage used"
          max={100}
          value={Math.min(storagePercent, 100)}
        />
        {storageError && <p className="file-error" role="alert">{storageError}</p>}
      </section>

      <section className="card">
        <div className="section-heading file-list-heading">
          <div className="row">
            <button
              className="icon-button"
              disabled={path === "/"}
              aria-label="Parent directory"
              onClick={() => {
                const parent = path.replace(/[^/]+\/$/, "");
                setPath(parent || "/");
              }}
            >
              <ArrowLeft size={17} />
            </button>
            <nav className="file-breadcrumbs" aria-label="File path">
              <button onClick={() => setPath("/")}>Root</button>
              {path
                .split("/")
                .filter(Boolean)
                .map((part, index, parts) => {
                  const target = `/${parts.slice(0, index + 1).join("/")}/`;
                  return (
                    <span className="row" key={target}>
                      <span aria-hidden="true">/</span>
                      <button onClick={() => setPath(target)}>{part}</button>
                    </span>
                  );
                })}
            </nav>
          </div>
          <div className="row">
            <span className="muted">{directoryFiles.length} items shown</span>
            {!DEMO && (
              <button
                className="icon-button"
                aria-label="Refresh file list"
                disabled={loading || busy}
                onClick={refresh}
              >
                <RefreshCw size={16} />
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="file-error-box" role="alert">
            <p>{error}</p>
            <button className="secondary" onClick={refresh}>
              Try again
            </button>
          </div>
        )}
        {loading ? (
          <div className="file-loading" role="status">Loading files…</div>
        ) : directoryFiles.length ? (
          <div className="table-scroll">
            <table className="file-table">
              <thead>
                <tr>
                  <th scope="col">NAME</th>
                  <th scope="col">TYPE</th>
                  <th scope="col">SIZE</th>
                  <th scope="col">MODIFIED</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {directoryFiles.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <button
                        className="file-name"
                        aria-label={file.kind === "folder" ? `Open folder ${file.name}` : file.name}
                        onClick={() =>
                          file.kind === "folder"
                            ? setPath(folderPath(file.name))
                            : void openPreview(file)
                        }
                      >
                        {file.kind === "folder" ? (
                          <Folder className="gold" size={19} />
                        ) : file.mime.startsWith("image/") ? (
                          <Image className="cyan" size={19} />
                        ) : (
                          <FileText className="cyan" size={19} />
                        )}
                        <span>{file.name}</span>
                      </button>
                    </td>
                    <td className="muted">{file.kind === "folder" ? "Folder" : file.mime || "File"}</td>
                    <td className="muted">{file.kind === "folder" ? "—" : formatBytes(file.size)}</td>
                    <td className="muted">{fileDate(file.modified)}</td>
                    <td>
                      <div className="row file-actions">
                        {file.kind === "file" && (
                          <>
                            <button
                              className="icon-button"
                              aria-label={`Preview ${file.name}`}
                              onClick={() => void openPreview(file)}
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Download ${file.name}`}
                              onClick={() => void download(file)}
                            >
                              <Download size={16} />
                            </button>
                            <button
                              className="secondary file-replace"
                              aria-label={`Replace ${file.name}`}
                              disabled={busy || mutationUnavailable}
                              onClick={() => {
                                replaceTarget.current = file;
                                if (input.current) {
                                  input.current.multiple = false;
                                  input.current.click();
                                }
                              }}
                            >
                              Replace
                            </button>
                          </>
                        )}
                        {file.kind === "file" && (
                          <button
                            className="icon-button"
                            aria-label={`Delete ${file.name}`}
                            disabled={busy || mutationUnavailable}
                            onClick={() => {
                              setDeleteError("");
                              setDeleting(file);
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : loading ? null : (
          <EmptyState
            title={
              hasMore
                ? "No files from this page in this folder"
                : path === "/"
                  ? "No files yet"
                  : "This folder is empty"
            }
            description={
              hasMore
                ? "Additional project files may appear on the next page. Load another page to continue browsing."
                : path === "/"
                  ? "Upload website files here to store them privately for this project."
                  : "Upload files into this directory or choose another folder."
            }
          />
        )}
        {!DEMO && hasMore && (
          <div className="file-pagination">
            <p>
              The file list is paginated. Load another page to find additional files in this folder.
            </p>
            <button
              className="secondary"
              disabled={loadingMore || busy}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading…" : "Load more files"}
            </button>
          </div>
        )}
      </section>

      <p className="integration-note file-privacy-note">
        Files remain private while hosting is inactive. Uploading or replacing files does not publish or deploy your website.
        {DEMO && " Demo changes stay in this browser session and never call the API."}
      </p>

      {preview && (
        <Modal
          title={preview.name}
          onClose={() => {
            setPreview(null);
            setPreviewUrl("");
          }}
        >
          {previewLoading ? (
            <p role="status">Loading preview…</p>
          ) : previewError ? (
            <p role="alert">{previewError}</p>
          ) : previewUrl ? (
            <img className="file-preview" src={previewUrl} alt={preview.name} />
          ) : (
            <pre>{previewContent}</pre>
          )}
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete file?"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
          closeDisabled={busy}
        >
          <p>
            Delete <strong>{deleting.name}</strong>? This cannot be undone.
          </p>
          {deleteError && <p className="file-error" role="alert">{deleteError}</p>}
          <button className="danger" disabled={busy} onClick={() => void confirmDelete()}>
            {busy ? "Deleting…" : "Delete file"}
          </button>
        </Modal>
      )}
    </>
  );
}
