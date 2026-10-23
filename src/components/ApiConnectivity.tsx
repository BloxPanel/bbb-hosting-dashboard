import { useState } from "react";
import { Activity } from "lucide-react";
import { resolveApiBaseUrl } from "../services/api";
import { connectivity } from "../services/connectivity";
export default function ApiConnectivity() {
  const [result, setResult] = useState<{ kind: string; data: unknown } | null>(
    null,
  );
  const [error, setError] = useState(() => {
    try {
      resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  });
  const [busy, setBusy] = useState(false);
  async function check(kind: "health" | "projectCount") {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult({ kind, data: await connectivity[kind]() });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="api-connectivity" aria-label="API connectivity">
      <div className="row">
        <Activity size={16} className="cyan" />
        <h3>API connectivity</h3>
      </div>
      <p>
        Check the live API connection. This does not sign you in or load account
        information.
      </p>
      <div className="row api-actions">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void check("health")}
        >
          {busy ? "Checking…" : "Check API health"}
        </button>
        {import.meta.env.DEV && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void check("projectCount")}
          >
            Read global project count
          </button>
        )}
      </div>
      {busy && <p role="status">Contacting the API…</p>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <div role="status">
          <p>
            {result.kind === "health"
              ? "Health endpoint response"
              : "Global database project count response — not your website count"}
          </p>
          <pre>
            {typeof result.data === "string"
              ? result.data
              : JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
