import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "../app/state";
import {
  isRetrySafeOperation,
  normalizeError,
  type ErrorContext,
  type NormalizedError,
} from "../services/errors";

export interface ErrorDisplayProps {
  error: unknown;
  context?: ErrorContext;
  title?: string;
  onRetry?: () => void | Promise<void>;
  retryLabel?: string;
  children?: ReactNode;
}

export function ErrorDisplay({
  error,
  context,
  title = "BBB Hosting",
  onRetry,
  retryLabel = "Retry",
  children,
}: ErrorDisplayProps) {
  const { setNotice } = useApp();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const manualCopyRef = useRef<HTMLTextAreaElement>(null);
  const contextStatus = context?.status;
  const contextIdentifier = context?.identifier;
  const contextBackendCode = context?.backendCode;
  const contextOperation = context?.operation;
  const contextComponent = context?.component;
  const contextField = context?.field;
  const contextReason = context?.reason;
  const contextMessage = context?.message;
  const contextRetryable = context?.retryable;
  const details = useMemo<NormalizedError>(
    () =>
      normalizeError(error, {
        status: contextStatus,
        identifier: contextIdentifier,
        backendCode: contextBackendCode,
        operation: contextOperation,
        component: contextComponent,
        field: contextField,
        reason: contextReason,
        message: contextMessage,
        retryable: contextRetryable,
      }),
    [
      error,
      contextStatus,
      contextIdentifier,
      contextBackendCode,
      contextOperation,
      contextComponent,
      contextField,
      contextReason,
      contextMessage,
      contextRetryable,
    ],
  );
  const canRetry =
    Boolean(onRetry) &&
    details.retryable &&
    isRetrySafeOperation(details.operation);
  const incidentStatus =
    details.referenceSource === "client"
      ? "Frontend-only; not automatically recorded in D1"
      : details.incidentRecorded === true
        ? "Recorded by the backend"
        : details.incidentRecorded === false
          ? "Not confirmed in D1; reference may be available in Worker logs"
          : "Recording status not provided by the backend";

  useEffect(() => {
    setNotice("");
  }, [setNotice]);

  useEffect(() => {
    if (copyState === "failed") {
      manualCopyRef.current?.focus();
      manualCopyRef.current?.select();
    }
  }, [copyState]);

  const copyReport = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyState("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(details.report);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section className="bbb-error-display" role="alert" aria-live="assertive" aria-atomic="true">
      <header className="bbb-error-header">
        <div>
          <div className="bbb-error-kicker">Diagnostics</div>
          <h2>{title} — Error {details.code}</h2>
        </div>
      </header>

      <p className="bbb-error-message">{details.message}</p>

      <dl className="bbb-error-grid">
        <div>
          <dt>BBB Error</dt>
          <dd>{details.code}</dd>
        </div>
        {details.httpStatus !== undefined && (
          <div>
            <dt>HTTP Status</dt>
            <dd>{details.httpStatus}</dd>
          </div>
        )}
        {details.component && (
          <div>
            <dt>Component</dt>
            <dd>{details.component}</dd>
          </div>
        )}
        {details.operation && (
          <div>
            <dt>Operation</dt>
            <dd>{details.operation}</dd>
          </div>
        )}
        {details.field && (
          <div>
            <dt>Affected Field</dt>
            <dd>{details.field}</dd>
          </div>
        )}
        <div>
          <dt>Reference</dt>
          <dd>{details.reference}</dd>
        </div>
        <div>
          <dt>Incident recording</dt>
          <dd>{incidentStatus}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{details.timestamp}</dd>
        </div>
      </dl>

      {details.reason && <p className="bbb-error-reason">{details.reason}</p>}
      {children}

      <div className="bbb-error-actions" role="group" aria-label="Error actions">
        <button type="button" className="bbb-error-button primary" onClick={copyReport}>
          {copyState === "copied" ? "Copied" : "Copy Error Details"}
        </button>
        {canRetry && onRetry && (
          <button type="button" className="bbb-error-button" onClick={() => void onRetry()}>
            {retryLabel}
          </button>
        )}
      </div>
      {copyState === "failed" && (
        <div className="bbb-error-copy-fallback">
          <p id="bbb-error-copy-help" role="status">
            Clipboard access is unavailable. Select and copy the report below.
          </p>
          <label htmlFor="bbb-error-report">Error report</label>
          <textarea
            ref={manualCopyRef}
            id="bbb-error-report"
            aria-describedby="bbb-error-copy-help"
            readOnly
            value={details.report}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
    </section>
  );
}

export default ErrorDisplay;
