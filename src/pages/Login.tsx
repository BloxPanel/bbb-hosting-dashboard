import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useApp } from "../app/state";
import { DEMO } from "../services/api";
import ApiConnectivity from "../components/ApiConnectivity";
import { auth, passwordError, safeDestination } from "../services/auth";
import { useRef } from "react";
type Mode = "login" | "register" | "forgot" | "verify" | "reset";
export default function Login({
  signUp = false,
  mode = "login",
}: {
  signUp?: boolean;
  mode?: Mode;
}) {
  const { user, setUser } = useApp();
  const location = useLocation();
  if (user && mode === "login" && !signUp)
    return <Navigate to={safeDestination(location.state?.from)} replace />;
  return (
    <div className="login">
      <div className="login-story">
        <div className="brand-name">
          BuiltBy<span>Buzz</span>
        </div>
        <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
        <h1>
          Good ideas deserve
          <br />a place online<span>.</span>
        </h1>
        <p>
          A home for every project. Simple hosting, thoughtful tools,
          <br />
          and one straightforward price.
        </p>
        <div className="login-price">
          $10 <span>/ website / year</span>
        </div>
        <small>
          <ShieldCheck size={16} /> Independently built. Designed for your next
          big thing.
        </small>
      </div>
      <section className="card login-card">
        <span className="eyebrow">HOSTING CONSOLE</span>
        <h2>
          {signUp
            ? "Make yourself at home."
            : {
                login: "Welcome back.",
                register: "Make yourself at home.",
                forgot: "Forgot your password?",
                verify: "Verify your email.",
                reset: "Choose a new password.",
              }[mode]}
        </h2>
        <p>
          {signUp
            ? "Create your BuiltByBuzz hosting account."
            : "Sign in to manage your corner of the internet."}
        </p>
        <AuthForm
          key={signUp ? "register" : mode}
          mode={signUp ? "register" : mode}
        />
        {(mode === "login" || signUp) && <ApiConnectivity />}
        {DEMO && mode === "login" && !signUp && (
          <div className="demo-login">
            <span className="demo-tag">DEVELOPMENT ONLY</span>
            <p>Explore fictional websites. No account or payment required.</p>
            <button
              className="secondary full"
              onClick={() =>
                setUser({
                  id: "demo_user",
                  name: "Jamie Demo",
                  email: "jamie@example.com",
                })
              }
            >
              Enter demo workspace <ArrowRight size={17} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function AuthForm({ mode }: { mode: Mode }) {
  const { setUser, notice, loading } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState(() => takeLinkToken());
  useEffect(() => {
    linkToken = "";
  }, []);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const isToken = mode === "verify" || mode === "reset";
  const newPassword = mode === "register" || mode === "reset";
  const titles = {
    login: "Sign in",
    register: "Create account",
    forgot: "Send reset instructions",
    verify: "Verify email",
    reset: "Reset password",
  };
  return (
    <>
      {notice && <p role="alert">{notice}</p>}
      {mode !== "login" && <h3>{titles[mode]}</h3>}
      {success ? (
        <p role="status">{success}</p>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy.current) return;
            const data = new FormData(event.currentTarget);
            const email = String(data.get("email") || "").trim();
            const password = String(data.get("password") || "");
            const name = String(data.get("name") || "").trim();
            const validation = newPassword
              ? passwordError(
                  password,
                  String(data.get("confirmPassword") || ""),
                )
              : "";
            if (validation || (mode === "register" && !name)) {
              setError(validation || "Enter a display name.");
              return;
            }
            busy.current = true;
            setPending(true);
            setError("");
            try {
              if (mode === "login") {
                setUser(await auth.login(email, password));
                navigate(safeDestination(location.state?.from), {
                  replace: true,
                });
              }
              if (mode === "register") {
                await auth.register(email, name, password);
                setSuccess(
                  "Check your email for a verification link. If your address is eligible, you'll receive instructions shortly.",
                );
              }
              if (mode === "forgot") {
                await auth.forgot(email);
                setSuccess(
                  "If an eligible account exists for that email, you'll receive password reset instructions.",
                );
              }
              if (mode === "verify") {
                await auth.verify(token);
                setToken("");
                linkToken = "";
                setSuccess("Email verified. You can now sign in.");
              }
              if (mode === "reset") {
                await auth.reset(token, password);
                setToken("");
                linkToken = "";
                setSuccess("Password reset. Sign in with your new password.");
              }
              if (mode !== "login" && event.target instanceof HTMLFormElement)
                event.target.reset();
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Please try again.",
              );
            } finally {
              busy.current = false;
              setPending(false);
            }
          }}
        >
          {mode === "register" && (
            <label>
              Display name
              <input name="name" autoComplete="name" required maxLength={80} />
            </label>
          )}
          {!isToken && (
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required />
            </label>
          )}
          {(mode === "login" || newPassword) && (
            <label>
              {newPassword ? "New password" : "Password"}
              <input
                name="password"
                type="password"
                autoComplete={newPassword ? "new-password" : "current-password"}
                required
                aria-describedby={newPassword ? "password-help" : undefined}
              />
            </label>
          )}
          {newPassword && (
            <>
              <p id="password-help">
                Use at least 12 characters, up to 1,024 UTF-8 bytes.
              </p>
              <label>
                Confirm password
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </label>
            </>
          )}
          {isToken && !token && (
            <p role="alert">
              This link is missing a token. Request a new link.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            className="primary full"
            disabled={
              pending || (mode === "login" && loading) || (isToken && !token)
            }
          >
            {pending ? "Please wait…" : titles[mode]} <ArrowRight size={17} />
          </button>
        </form>
      )}
      <p className="auth-switch">
        <Link className="text-link" to="/login">
          Sign in
        </Link>{" "}
        ·{" "}
        <Link className="text-link" to="/register">
          Create account
        </Link>{" "}
        ·{" "}
        <Link className="text-link" to="/forgot-password">
          Forgot password?
        </Link>
      </p>
    </>
  );
}

// main.tsx captures before React renders, including StrictMode's repeated renders.
export function takeLinkToken(): string {
  const value = linkToken;
  return value;
}
let linkToken = "";
export function captureLinkToken() {
  if (
    window.location.pathname === "/verify-email" ||
    window.location.pathname === "/reset-password"
  ) {
    linkToken =
      new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
  }
}
