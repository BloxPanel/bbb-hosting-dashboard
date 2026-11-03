import { useState } from "react";
import { Activity } from "lucide-react";
import { resolveApiBaseUrl } from "../services/api";
import { connectivity } from "../services/connectivity";
import { ErrorDisplay } from "./ErrorDisplay";
export default function ApiConnectivity() {
  const [result, setResult] = useState<{ kind: string; data: unknown } | null>(
    null,
  );
  const [configurationError] = useState(() => {
    try {
      resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  });
  const [error, setError] = useState<unknown | null>(null);
  const [busy, setBusy] = useState(false);
  const [failedKind, setFailedKind] = useState<"health" | "projectCount">("health");
  async function check(kind: "health" | "projectCount") {
    setBusy(true);
    setError(null);
    setFailedKind(kind);
    setResult(null);
    try {
      setResult({ kind, data: await connectivity[kind]() });
    } catch (e) {
      setError(e);
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
      {configurationError && <p role="alert">{configurationError}</p>}
      {error !== null && (
        <ErrorDisplay
          error={error}
          context={{
            component: "API Connectivity",
            operation: failedKind === "health" ? "Check API Health" : "Read Project Count",
            reason: "Request failed",
            retryable: true,
          }}
          onRetry={() => check(failedKind)}
        />
      )}
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
