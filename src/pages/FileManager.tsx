import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import {
  ArrowLeft,
  Code2,
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
import { createDiagnosticError, hasDiagnosticCode } from "../services/errors";
import {
  decodeEditableText,
  files as fileApi,
  MAX_FILE_BYTES,
  MAX_INLINE_EDIT_BYTES,
  MAX_PROJECT_FILES,
  MAX_STORAGE_BYTES,
  isEditableFilePath,
  validateFilePath,
  type ProjectStorage,
} from "../services/files";
import { EmptyState, Modal } from "../components/ui";
import { ErrorDisplay } from "../components/ErrorDisplay";
import type { HostedFile } from "../types";

const CodeEditor = lazy(() =>
  import("../components/CodeEditor").then((module) => ({ default: module.CodeEditor })),
);

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

function editorLanguage(file: HostedFile): string {
  const extension = file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
  const languages: Readonly<Record<string, string>> = {
    css: "CSS",
    csv: "CSV",
    htm: "HTML",
    html: "HTML",
    js: "JavaScript",
    json: "JSON",
    md: "Markdown",
    mjs: "JavaScript",
    txt: "Plain text",
    webmanifest: "JSON",
    xml: "XML",
  };
  return languages[extension] ?? "Plain text";
}

function editorDirectory(file: HostedFile): string {
  const path = objectPath(file);
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash + 1);
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
      let content: string | undefined;
      if (isText) {
        try {
          if (!(reader.result instanceof ArrayBuffer)) throw new TypeError();
          content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(reader.result);
        } catch {
          reject(new Error("Text files must contain valid UTF-8 data."));
          return;
        }
      }
      const slash = path.lastIndexOf("/");
      resolve({
        id: path,
        siteId,
        name: path.slice(slash + 1),
        path: slash < 0 ? "/" : `/${path.slice(0, slash + 1)}`,
        size: file.size,
        kind: "file",
        mime,
        content,
        dataUrl: isText ? undefined : String(reader.result),
        modified: new Date().toISOString(),
      });
    };
    reader.onerror = () => reject(new Error("Unable to read the selected file."));
    if (isText) reader.readAsArrayBuffer(file);
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
  const [error, setError] = useState<unknown | null>(null);
  const [storage, setStorage] = useState<ProjectStorage | null>(null);
  const [storageError, setStorageError] = useState<unknown | null>(null);
  const [uploadFailure, setUploadFailure] = useState<{
    error: unknown;
    operation: "Upload File" | "Replace File";
  } | null>(null);
  const [downloadFailure, setDownloadFailure] = useState<{
    error: unknown;
    file: HostedFile;
  } | null>(null);
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
  const [previewFailure, setPreviewFailure] = useState<unknown | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editorFile, setEditorFile] = useState<HostedFile | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorSavedContent, setEditorSavedContent] = useState("");
  const [editorLineSeparator, setEditorLineSeparator] = useState("\n");
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorLoaded, setEditorLoaded] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorSavePercent, setEditorSavePercent] = useState(0);
  const [editorPosition, setEditorPosition] = useState({ line: 1, column: 1 });
  const [editorWrap, setEditorWrap] = useState(false);
  const [editorFailure, setEditorFailure] = useState<unknown | null>(null);
  const [editorFailureOperation, setEditorFailureOperation] = useState<"Load Editor File" | "Save File">("Load Editor File");
  const [editorIssue, setEditorIssue] = useState("");
  const [deleting, setDeleting] = useState<HostedFile | null>(null);
  const [deleteError, setDeleteError] = useState<unknown | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const editorCloseButton = useRef<HTMLButtonElement>(null);
  const editorSaveButton = useRef<HTMLButtonElement>(null);
  const replaceTarget = useRef<HostedFile | null>(null);
  const editorDirty = editorFile !== null && editorContent !== editorSavedContent;
  const editorSize = useMemo(
    () => new TextEncoder().encode(editorContent).byteLength,
    [editorContent],
  );
  const navigationBlocker = useBlocker(editorDirty);

  useEffect(() => {
    if (!editorDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [editorDirty]);

  useEffect(() => {
    if (navigationBlocker.state !== "blocked") return;
    if (window.confirm("This file has unsaved changes. Discard them and leave the editor?")) {
      navigationBlocker.proceed();
    } else {
      navigationBlocker.reset();
    }
  }, [navigationBlocker]);

  useEffect(() => {
    if (DEMO) return;
    let active = true;
    setLoading(true);
    setError(null);
    setStorageError(null);
    setUploadFailure(null);
    setDownloadFailure(null);
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
          setError(pageResult.reason);
        }
        if (storageResult.status === "fulfilled") {
          setStorage(storageResult.value);
        } else {
          setStorageError(storageResult.reason);
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
    setError(null);
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
      setError(requestError);
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
    setUploadFailure(null);
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
      setUploadFailure({
        error: requestError,
        operation: target ? "Replace File" : "Upload File",
      });
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
    setDownloadFailure(null);
    try {
      const result = await fileApi.download(site.id, objectPath(file));
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setDownloadFailure({ error: requestError, file });
    }
  }

  async function openPreview(file: HostedFile) {
    setPreview(file);
    setPreviewUrl("");
    setPreviewContent("");
    setPreviewError("");
    setPreviewFailure(null);
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
      setPreviewFailure(requestError);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function openEditor(file: HostedFile) {
    setPreview(null);
    setEditorFile(file);
    setEditorContent("");
    setEditorSavedContent("");
    setEditorPosition({ line: 1, column: 1 });
    setEditorWrap(false);
    setEditorLoaded(false);
    setEditorLineSeparator("\n");
    setEditorFailure(null);
    setEditorIssue("");
    if (!isEditableFilePath(objectPath(file))) {
      setEditorIssue("This file type cannot be edited inline.");
      setEditorFailureOperation("Load Editor File");
      setEditorFailure(
        createDiagnosticError("UNSUPPORTED_FILE_TYPE", {
          component: "Code Editor",
          operation: "Load Editor File",
          reason: "Unsupported file type",
        }),
      );
      return;
    }
    if (file.size > MAX_INLINE_EDIT_BYTES) {
      setEditorIssue(
        `This file is ${formatBytes(file.size)}. Inline editing is limited to ${formatBytes(MAX_INLINE_EDIT_BYTES)}. Download it, edit it locally, then use Replace to upload it.`,
      );
      setEditorFailureOperation("Load Editor File");
      setEditorFailure(
        createDiagnosticError("FILE_TOO_LARGE", {
          component: "Code Editor",
          operation: "Load Editor File",
          reason: "Inline edit size limit exceeded",
        }),
      );
      return;
    }
    setEditorLoading(true);
    try {
      let decoded: { content: string; lineSeparator: string };
      if (DEMO) {
        if (file.content === undefined) {
          throw new Error("This demo file does not have editable text content.");
        }
        decoded = decodeEditableText(new TextEncoder().encode(file.content).buffer);
      } else {
        const downloaded = await fileApi.download(site.id, objectPath(file));
        if (downloaded.blob.size > MAX_INLINE_EDIT_BYTES) {
          setEditorIssue(
            `This file exceeds the ${formatBytes(MAX_INLINE_EDIT_BYTES)} inline editing limit. Download it, edit it locally, then use Replace to upload it.`,
          );
          setEditorFailureOperation("Load Editor File");
          setEditorFailure(
            createDiagnosticError("FILE_TOO_LARGE", {
              component: "Code Editor",
              operation: "Load Editor File",
              reason: "Inline edit size limit exceeded",
            }),
          );
          return;
        }
        decoded = decodeEditableText(await downloaded.blob.arrayBuffer());
      }
      setEditorContent(decoded.content);
      setEditorSavedContent(decoded.content);
      setEditorLineSeparator(decoded.lineSeparator);
      setEditorLoaded(true);
    } catch (requestError) {
      setEditorFailureOperation("Load Editor File");
      setEditorFailure(requestError);
    } finally {
      setEditorLoading(false);
    }
  }

  function closeEditor() {
    if (editorDirty && !window.confirm("Discard your unsaved changes?")) return;
    if (editorSaving) return;
    setEditorFile(null);
    setEditorLoaded(false);
    setEditorFailure(null);
    setEditorIssue("");
  }

  async function saveEditor() {
    if (!editorFile || editorSaving || !editorDirty) return;
    const targetPath = objectPath(editorFile);
    if (!isEditableFilePath(targetPath)) {
      setEditorIssue("This file type is no longer allowed for inline editing.");
      setEditorFailureOperation("Save File");
      setEditorFailure(
        createDiagnosticError("UNSUPPORTED_FILE_TYPE", {
          component: "Code Editor",
          operation: "Save File",
          reason: "Unsupported file type",
        }),
      );
      return;
    }
    if (editorFile.size > MAX_INLINE_EDIT_BYTES) {
      setEditorIssue(`Inline editing is limited to ${formatBytes(MAX_INLINE_EDIT_BYTES)}.`);
      setEditorFailureOperation("Save File");
      setEditorFailure(
        createDiagnosticError("FILE_TOO_LARGE", {
          component: "Code Editor",
          operation: "Save File",
          reason: "Inline edit size limit exceeded",
        }),
      );
      return;
    }
    const bytes = new TextEncoder().encode(editorContent);
    if (bytes.byteLength > MAX_INLINE_EDIT_BYTES) {
      setEditorIssue(`Inline editing is limited to ${formatBytes(MAX_INLINE_EDIT_BYTES)} per saved file.`);
      setEditorFailureOperation("Save File");
      setEditorFailure(
        createDiagnosticError("FILE_TOO_LARGE", {
          component: "Code Editor",
          operation: "Save File",
          reason: "Inline edit size limit exceeded",
        }),
      );
      return;
    }
    setEditorSaving(true);
    setEditorSavePercent(0);
    setEditorFailure(null);
    setEditorIssue("");
    const contentToSave = editorContent;
    try {
      const replacement = new File([bytes], editorFile.name, {
        type: editorFile.mime || "text/plain;charset=utf-8",
      });
      if (DEMO) {
        setSiteFiles((current) => ({
          ...current,
          [site.id]: (current[site.id] ?? initialFiles(site.id)).map((entry) =>
            entry.kind === "file" && objectPath(entry) === targetPath
              ? { ...entry, content: contentToSave, size: bytes.byteLength, modified: new Date().toISOString() }
              : entry,
          ),
        }));
      } else {
        await fileApi.replace(site.id, replacement, targetPath, setEditorSavePercent);
        refresh();
      }
      setEditorSavedContent(contentToSave);
      setNotice(
        DEMO
          ? "Changes saved to local demo memory only. Nothing was uploaded."
          : "File saved. This does not publish or deploy your website.",
      );
    } catch (requestError) {
      setEditorFailureOperation("Save File");
      setEditorFailure(requestError);
      if (
        typeof requestError === "object" &&
        requestError !== null &&
        "identifier" in requestError &&
        requestError.identifier === "NETWORK_ERROR"
      ) {
        setEditorIssue(
          "The connection ended before the save was confirmed. The server may have applied the replacement; your editor contents are retained. Check the file before trying another save.",
        );
      }
    } finally {
      setEditorSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setDeleteError(null);
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
      setDeleteError(requestError);
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

      {uploadFailure && (
        <ErrorDisplay
          error={uploadFailure.error}
          context={{
            identifier: hasDiagnosticCode(uploadFailure.error)
              ? undefined
              : uploadFailure.operation === "Replace File"
                ? "FILE_REPLACE_FAILED"
                : "FILE_UPLOAD_FAILED",
            component: "File Manager",
            operation: uploadFailure.operation,
            reason: "Upload failed",
            retryable: false,
          }}
        />
      )}
      {downloadFailure && (
        <ErrorDisplay
          error={downloadFailure.error}
          context={{
            identifier: hasDiagnosticCode(downloadFailure.error)
              ? undefined
              : "INVALID_API_RESPONSE",
            component: "File Manager",
            operation: "Download File",
            reason: "Download failed",
            retryable: true,
          }}
          onRetry={() => download(downloadFailure.file)}
        />
      )}

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
        {storageError !== null && (
          <ErrorDisplay
            error={storageError}
            context={{
              identifier: hasDiagnosticCode(storageError)
                ? undefined
                : "INVALID_API_RESPONSE",
              component: "File Manager",
              operation: "Load Storage",
              reason: "Unexpected response shape",
              retryable: true,
            }}
            onRetry={refresh}
            retryLabel="Retry storage"
          />
        )}
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

        {error !== null && (
          <div className="file-error-box">
            <ErrorDisplay
              error={error}
              context={{
                identifier: hasDiagnosticCode(error)
                  ? undefined
                  : "FILE_LIST_FAILED",
                component: "File Manager",
                operation: "Load Files",
                reason: "Unexpected response shape",
                retryable: true,
              }}
              onRetry={refresh}
              retryLabel="Try again"
            />
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
                            {isEditableFilePath(objectPath(file)) && (
                              <button
                                className="secondary file-edit"
                                aria-label={`Edit ${file.name}`}
                                disabled={busy}
                                onClick={() => void openEditor(file)}
                              >
                                <Code2 size={15} />
                                Edit
                              </button>
                            )}
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
                              setDeleteError(null);
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
          ) : previewFailure ? (
            <ErrorDisplay
              error={previewFailure}
              context={{
                identifier: hasDiagnosticCode(previewFailure)
                  ? undefined
                  : "INVALID_API_RESPONSE",
                component: "File Manager",
                operation: "Load Preview",
                reason: "Download failed",
                retryable: true,
              }}
              onRetry={() => openPreview(preview)}
            />
          ) : previewError ? (
            <p role="alert">{previewError}</p>
          ) : previewUrl ? (
            <img className="file-preview" src={previewUrl} alt={preview.name} />
          ) : (
            <pre>{previewContent}</pre>
          )}
        </Modal>
      )}

      {editorFile && (
        <Modal
          title="Edit file"
          className="code-editor-dialog"
          onClose={closeEditor}
          closeDisabled={editorLoading || editorSaving}
          headerContent={
            <header className="editor-file-heading">
              <div className="editor-file-identity">
                <FileText size={19} aria-hidden="true" />
                <div className="editor-file-name">
                  <strong>{editorFile.name}</strong>
                  {editorDirectory(editorFile) && <code>{editorDirectory(editorFile)}</code>}
                </div>
              </div>
              <div className="editor-header-meta">
                <span className="editor-language">{editorLanguage(editorFile)}</span>
                {editorDirty && <span className="editor-unsaved" aria-hidden="true">Unsaved changes</span>}
              </div>
            </header>
          }
        >
          <div className="editor-dialog-content">
            <p className="editor-conflict-note">
              Simultaneous editors are not conflict-protected; another save may be overwritten.
            </p>
            {editorIssue && <p className="editor-issue" role="alert">{editorIssue}</p>}
            {(editorFailure !== null || editorLoading) && (
              <div className="editor-feedback">
                {editorLoading && <p role="status">Loading file contents…</p>}
                {editorFailure !== null && (
                  <ErrorDisplay
                    error={editorFailure}
                    context={{
                      identifier: hasDiagnosticCode(editorFailure)
                        ? undefined
                        : editorFailureOperation === "Save File"
                          ? "FILE_REPLACE_FAILED"
                          : "INVALID_API_RESPONSE",
                      component: "Code Editor",
                      operation: editorFailureOperation,
                      reason: editorFailureOperation === "Save File" ? "Save failed" : "Download failed",
                      retryable: editorFailureOperation !== "Save File",
                    }}
                    onRetry={editorFailureOperation === "Load Editor File" ? () => void openEditor(editorFile) : undefined}
                    retryLabel="Retry download"
                  />
                )}
              </div>
            )}
            <div className="editor-workspace">
              {editorLoaded && (
                <Suspense fallback={<p className="editor-loading-tools" role="status">Loading editor tools…</p>}>
                  <CodeEditor
                    path={objectPath(editorFile)}
                    content={editorContent}
                    lineSeparator={editorLineSeparator}
                    wrap={editorWrap}
                    onToggleWrap={() => setEditorWrap((current) => !current)}
                    onChange={setEditorContent}
                    onCursorChange={setEditorPosition}
                    onSave={() => void saveEditor()}
                    onEditorExit={() => {
                      if (editorSaveButton.current && !editorSaveButton.current.disabled) {
                        editorSaveButton.current.focus();
                      } else {
                        editorCloseButton.current?.focus();
                      }
                    }}
                  />
                </Suspense>
              )}
            </div>
            <footer className="editor-footer">
              <div className="editor-statusbar" role="group" aria-label="Editor status">
                <span>Ln {editorPosition.line}, Col {editorPosition.column}</span>
                <span>{editorLanguage(editorFile)}</span>
                <span>UTF-8</span>
                <span aria-label={`File size ${formatBytes(editorSize)}`}>
                  {formatBytes(editorSize)}
                </span>
                <span className={editorDirty ? "status-unsaved" : "status-saved"}>
                  <span role="status" aria-live="polite">
                    {editorSaving ? `Saving ${editorSavePercent}%` : editorDirty ? "Unsaved" : "Saved"}
                  </span>
                </span>
              </div>
              {editorSaving && <progress className="editor-save-progress" max={100} value={editorSavePercent} aria-label="Save progress" />}
              <div className="editor-actions">
                <button ref={editorCloseButton} type="button" className="secondary" disabled={editorLoading || editorSaving} onClick={closeEditor}>
                  Close
                </button>
                <button ref={editorSaveButton} type="button" className="primary" disabled={!editorDirty || editorSaving || !editorLoaded} onClick={() => void saveEditor()}>
                  {editorSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </footer>
          </div>
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
          {deleteError !== null && (
            <ErrorDisplay
              error={deleteError}
              context={{
                identifier: hasDiagnosticCode(deleteError)
                  ? undefined
                  : "FILE_DELETE_FAILED",
                component: "File Manager",
                operation: "Delete File",
                reason: "Delete failed",
                retryable: false,
              }}
            />
          )}
          <button className="danger" disabled={busy} onClick={() => void confirmDelete()}>
            {busy ? "Deleting…" : "Delete file"}
          </button>
        </Modal>
      )}
    </>
  );
}
