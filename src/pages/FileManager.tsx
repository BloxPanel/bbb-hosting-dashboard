import { useRef, useState } from "react";
import {
  Upload,
  Folder,
  FileText,
  Image,
  Download,
  Pencil,
  Trash2,
  ArrowLeft,
  Eye,
} from "lucide-react";
import { useSite } from "./Site";
import { useApp } from "../app/state";
import { initialFiles } from "../services/demo";
import { DEMO } from "../services/api";
import { EmptyState, Modal } from "../components/ui";
import type { HostedFile } from "../types";
export default function FileManager() {
  const site = useSite();
  const { setNotice, siteFiles, setSiteFiles } = useApp();
  const files = siteFiles[site.id] ?? (DEMO ? initialFiles(site.id) : []);
  const setFiles = (update: (items: HostedFile[]) => HostedFile[]) =>
    setSiteFiles((current) => ({
      ...current,
      [site.id]: update(
        current[site.id] ?? (DEMO ? initialFiles(site.id) : []),
      ),
    }));
  const [path, setPath] = useState("/");
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<HostedFile | null>(null);
  const [renaming, setRenaming] = useState<HostedFile | null>(null);
  const [deleting, setDeleting] = useState<HostedFile | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function upload(list: FileList | null) {
    if (!DEMO || !list) return;
    setProgress(0);
    const chosen = Array.from(list);
    try {
      for (let i = 0; i < chosen.length; i++) {
        const file = chosen[i];
        if (file.size > 5 * 1024 * 1024)
          throw new Error("Demo previews support files up to 5 MB.");
        const isText =
          file.type.startsWith("text/") ||
          /\.(html|css|js|json|txt|md|svg)$/.test(file.name);
        const content = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(new Error("Unable to read file"));
          if (isText) r.readAsText(file);
          else r.readAsDataURL(file);
        });
        setFiles((fs) => [
          ...fs,
          {
            id: crypto.randomUUID(),
            siteId: site.id,
            name: file.name,
            path,
            size: file.size,
            kind: "file",
            mime: file.type,
            content: isText ? content : undefined,
            dataUrl: isText ? undefined : content,
            modified: new Date().toISOString().slice(0, 10),
          },
        ]);
        setProgress(Math.round(((i + 1) / chosen.length) * 100));
      }
      setNotice(
        "Files added to local demo memory. Nothing was uploaded to R2.",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }
  function download(file: HostedFile) {
    const a = document.createElement("a");
    const url = file.dataUrl
      ? file.dataUrl
      : URL.createObjectURL(
          new Blob([file.content || ""], { type: file.mime || "text/plain" }),
        );
    a.href = url;
    a.download = file.name;
    a.click();
    if (!file.dataUrl) URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>File manager</h2>
          <p>Website files · local demo storage</p>
        </div>
        <button
          className="primary"
          disabled={!DEMO}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          Upload files
        </button>
      </div>
      <input
        ref={input}
        className="sr-only"
        type="file"
        multiple
        onChange={(e) => void upload(e.target.files)}
        aria-label="Choose files"
      />
      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void upload(e.dataTransfer.files);
        }}
      >
        <Upload size={26} />
        <h3>Drop your website files here</h3>
        <p>
          or{" "}
          <button
            className="inline-button"
            disabled={!DEMO}
            onClick={() => input.current?.click()}
          >
            browse files
          </button>{" "}
          · Demo limit: 5 MB per file
        </p>
        {progress !== null && (
          <div>
            <label>
              Reading local files {progress}%
              <progress max={100} value={progress} />
            </label>
          </div>
        )}
      </div>
      <section className="card">
        <div className="section-heading">
          <div className="row">
            <button
              className="icon-button"
              disabled={path === "/"}
              aria-label="Parent directory"
              onClick={() => setPath(path.replace(/[^/]+\/$/, ""))}
            >
              <ArrowLeft size={17} />
            </button>
            <strong>{path}</strong>
          </div>
          <span className="muted">
            {files.filter((f) => f.path === path).length} items
          </span>
        </div>
        {files.some((f) => f.path === path) ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>SIZE</th>
                  <th>MODIFIED</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {files
                  .filter((f) => f.path === path)
                  .map((f) => (
                    <tr key={f.id}>
                      <td>
                        <button
                          className="file-name"
                          onClick={() =>
                            f.kind === "folder"
                              ? setPath(`${path}${f.name}/`)
                              : setPreview(f)
                          }
                        >
                          {f.kind === "folder" ? (
                            <Folder className="gold" size={19} />
                          ) : f.mime.startsWith("image/") ? (
                            <Image className="cyan" size={19} />
                          ) : (
                            <FileText className="cyan" size={19} />
                          )}{" "}
                          {f.name}
                        </button>
                      </td>
                      <td className="muted">
                        {f.kind === "folder"
                          ? "—"
                          : f.size < 1024
                            ? `${f.size} B`
                            : `${(f.size / 1024).toFixed(1)} KB`}
                      </td>
                      <td className="muted">{f.modified}</td>
                      <td>
                        <div className="row">
                          {f.kind === "file" && (
                            <>
                              <button
                                className="icon-button"
                                aria-label={`Preview ${f.name}`}
                                onClick={() => setPreview(f)}
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Download ${f.name}`}
                                onClick={() => download(f)}
                              >
                                <Download size={16} />
                              </button>
                            </>
                          )}
                          <button
                            className="icon-button"
                            aria-label={`Rename ${f.name}`}
                            onClick={() => setRenaming(f)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Delete ${f.name}`}
                            onClick={() => setDeleting(f)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="An empty folder, full of possibility"
            description="Drop files here to add them to this demo directory."
          />
        )}
      </section>
      <p className="integration-note">
        No R2 connection is configured. File changes exist only in browser
        memory.
      </p>
      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)}>
          {preview.mime.startsWith("image/") && preview.dataUrl ? (
            <img
              className="file-preview"
              src={preview.dataUrl}
              alt={preview.name}
            />
          ) : preview.mime.startsWith("text/") ||
            /\.(html|css|js|json|txt|md)$/.test(preview.name) ? (
            <pre>{preview.content}</pre>
          ) : (
            <p>Preview is unavailable for this file type.</p>
          )}
        </Modal>
      )}
      {renaming && (
        <Modal title="Rename item" onClose={() => setRenaming(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(
                new FormData(e.currentTarget).get("name"),
              ).trim();
              if (
                !name ||
                name === "." ||
                name === ".." ||
                /[\\/]/.test(name)
              ) {
                setNotice("Use a name without slashes.");
                return;
              }
              if (
                files.some(
                  (f) =>
                    f.id !== renaming.id && f.path === path && f.name === name,
                )
              ) {
                setNotice("An item with that name already exists.");
                return;
              }
              const oldPrefix = `${path}${renaming.name}/`;
              setFiles((fs) =>
                fs.map((f) =>
                  f.id === renaming.id
                    ? { ...f, name }
                    : renaming.kind === "folder" && f.path.startsWith(oldPrefix)
                      ? {
                          ...f,
                          path: f.path.replace(oldPrefix, `${path}${name}/`),
                        }
                      : f,
                ),
              );
              setRenaming(null);
            }}
          >
            <label>
              New name
              <input name="name" required defaultValue={renaming.name} />
            </label>
            <button className="primary">Rename locally</button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Delete item?" onClose={() => setDeleting(null)}>
          <p>
            Remove {deleting.name}
            {deleting.kind === "folder" ? " and all its contents" : ""} from the
            demo? This cannot be undone.
          </p>
          <button
            className="danger"
            onClick={() => {
              setFiles((fs) =>
                fs.filter(
                  (f) =>
                    f.id !== deleting.id &&
                    !(
                      deleting.kind === "folder" &&
                      f.path.startsWith(`${path}${deleting.name}/`)
                    ),
                ),
              );
              setDeleting(null);
            }}
          >
            Delete locally
          </button>
        </Modal>
      )}
    </>
  );
}
