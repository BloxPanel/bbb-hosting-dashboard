import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useApp } from "../app/state";
import { DEMO } from "../services/api";
import ApiConnectivity from "../components/ApiConnectivity";
export default function Login({ signUp = false }: { signUp?: boolean }) {
  const { user, setUser } = useApp();
  const [error, setError] = useState("");
  if (user) return <Navigate to="/dashboard" replace />;
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
        <h2>{signUp ? "Make yourself at home." : "Welcome back."}</h2>
        <p>
          {signUp
            ? "Create your BuiltByBuzz hosting account."
            : "Sign in to manage your corner of the internet."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(
              signUp
                ? "Account registration is unavailable until the backend authentication contract is connected."
                : "Sign-in is unavailable until the backend authentication contract is connected.",
            );
          }}
        >
          {signUp && (
            <label>
              Full name
              <input
                name="name"
                autoComplete="name"
                placeholder="Your full name"
                required
                maxLength={80}
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={signUp ? "new-password" : "current-password"}
              placeholder="Your password"
              required
            />
          </label>
          {signUp && (
            <label>
              Confirm password
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your password"
                required
              />
            </label>
          )}
          <button
            className="primary full"
            disabled
            aria-describedby="auth-unavailable"
          >
            {signUp ? "Create account" : "Sign in"} <ArrowRight size={17} />
          </button>
        </form>
        <p className="integration-note" id="auth-unavailable">
          {signUp ? "Account registration" : "Production sign-in"} is
          unavailable until the backend authentication contract is connected.
        </p>
        <p className="auth-switch">
          {signUp ? "Already have an account? " : "New to BuiltByBuzz? "}
          <Link className="text-link" to={signUp ? "/login" : "/signup"}>
            {signUp ? "Sign in" : "Sign up"}
          </Link>
        </p>
        <ApiConnectivity />
        {error && <p role="alert">{error}</p>}
        {DEMO && (
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
