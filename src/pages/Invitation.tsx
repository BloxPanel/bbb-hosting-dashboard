import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useApp } from "../app/state";
import { ErrorDisplay } from "../components/ErrorDisplay";
import {
  captureInvitationToken,
  clearInvitationToken,
  getInvitationToken,
  invitations,
} from "../services/invitations";
import { auth } from "../services/auth";

export function InvitationLanding() {
  const { user } = useApp();
  const [token, setToken] = useState(getInvitationToken);
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [failure, setFailure] = useState<unknown | null>(null);

  useEffect(() => {
    captureInvitationToken();
    const captured = getInvitationToken();
    setToken(captured);
    if (!captured) {
      setValidating(false);
      return;
    }
    let active = true;
    invitations
      .validate(captured)
      .then(() => {
        if (active) setValid(true);
      })
      .catch((error: unknown) => {
        if (active) setFailure(error);
      })
      .finally(() => {
        if (active) setValidating(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AuthShell>
      <span className="eyebrow">CLOSED PRE-ALPHA INVITATION</span>
      <h2>You’re invited.</h2>
      <p>
        BuiltByBuzz Hosting is in closed pre-alpha. This invitation is checked
        securely without revealing its intended email address.
      </p>
      {validating && <p role="status">Checking your invitation…</p>}
      {!token && (
        <p role="alert">
          This invitation link is missing its token. Open the complete link
          provided by your inviter.
        </p>
      )}
      {failure !== null && (
        <ErrorDisplay
          error={failure}
          context={{
            component: "Authentication",
            operation: "invitations.validate",
            reason: "Request failed",
            retryable: false,
          }}
        />
      )}
      {valid && (
        <div className="invite-actions">
          {user ? (
            <Link
              className="primary full invite-link-button"
              to={user.prealphaAccess ? "/dashboard" : "/access-restricted"}
            >
              {user.prealphaAccess ? "Continue to your workspace" : "Continue access approval"}
              <ArrowRight size={17} />
            </Link>
          ) : (
            <>
              <Link className="primary full invite-link-button" to="/register">
                Continue to create your account <ArrowRight size={17} />
              </Link>
              <Link
                className="secondary full invite-link-button"
                to="/login"
                state={{ fromInvitation: true }}
              >
                Already have an account? Sign in
              </Link>
            </>
          )}
        </div>
      )}
      <Link className="text-link" to="/access-restricted">
        About closed pre-alpha access
      </Link>
    </AuthShell>
  );
}

export function AccessRestricted() {
  const { user, setUser } = useApp();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown | null>(null);
  const [notice, setNotice] = useState("");

  if (user?.prealphaAccess) return <Navigate to="/dashboard" replace />;

  const resumeAccess = async () => {
    setPending(true);
    setFailure(null);
    setNotice("");
    try {
      await invitations.redeem(getInvitationToken() || undefined);
      clearInvitationToken();
      const refreshed = await auth.session();
      setUser(refreshed);
      if (refreshed.prealphaAccess) navigate("/dashboard", { replace: true });
      else setNotice("Your access is still being confirmed. Please try again.");
    } catch (error) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  };

  const signOut = async () => {
    setPending(true);
    setFailure(null);
    try {
      await auth.logout();
      clearInvitationToken();
      setUser(null);
      navigate("/login", { replace: true });
    } catch (error) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell>
      <span className="eyebrow">BUILTBYBUZZ HOSTING</span>
      <h2>Access is currently restricted.</h2>
      <p>
        BBB Hosting is in closed pre-alpha. Hosting tools are available only to
        the platform owner and approved testers. Public registration is not
        available.
      </p>
      {user ? (
        <>
          <p>
            Signed in as <strong>{user.email}</strong>. If you have completed
            email verification, you can retry access approval.
          </p>
          {!user.prealphaAccess && (
            <button
              className="primary full"
              onClick={resumeAccess}
              disabled={pending || user.emailVerified !== true}
            >
              {pending ? "Checking access…" : "Complete access approval"}
              <ArrowRight size={17} />
            </button>
          )}
          {user.emailVerified !== true && (
            <p role="status">
              Verify your email using the link we sent, then sign in again to
              finish access approval.
            </p>
          )}
          <button
            className="secondary full"
            onClick={signOut}
            disabled={pending}
          >
            Sign out
          </button>
        </>
      ) : (
        <Link className="primary full invite-link-button" to="/login">
          Returning tester? Sign in <ArrowRight size={17} />
        </Link>
      )}
      {notice && <p role="status">{notice}</p>}
      {failure !== null && (
        <ErrorDisplay
          error={failure}
          context={{
            component: "Authentication",
            operation: "invitations.redeem",
            reason: "Request failed",
            retryable: false,
          }}
        />
      )}
      <div className="restricted-security">
        <ShieldCheck size={18} />
        <span>
          Account access is verified by the hosting API. A signed-in session
          alone does not grant hosting access.
        </span>
      </div>
      <p className="auth-switch">
        <Link className="text-link" to="/forgot-password">
          Password recovery
        </Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: import("react").ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-brand">
        <span className="brand-name">
          BuiltBy<span>Buzz</span>
        </span>
        <small>HOSTING CONSOLE</small>
      </div>
      <section className="card auth-card">{children}</section>
      <p className="auth-footnote">Built for ideas worth putting online.</p>
    </main>
  );
}
