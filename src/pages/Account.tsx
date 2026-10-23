import { useApp } from "../app/state";
import { PageHeading } from "../components/ui";
import { DEMO } from "../services/api";
export default function Account() {
  const { user, setUser, setNotice } = useApp();
  return (
    <>
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Account settings"
        description="Your profile and workspace preferences."
      />
      <section className="card padded account-form">
        <h2>Profile information</h2>
        <p>
          {DEMO
            ? "Fictional account · changes are local to this demo session."
            : "Your authenticated account profile."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!user || !DEMO) return;
            const data = new FormData(e.currentTarget);
            setUser({ ...user, name: String(data.get("name")).trim() });
            setNotice("Demo profile saved locally.");
          }}
        >
          <label>
            Full name
            <input
              name="name"
              defaultValue={user?.name}
              required
              maxLength={80}
            />
          </label>
          <label>
            Email address
            <input type="email" value={user?.email || ""} readOnly />
          </label>
          <p>
            Email changes and security settings require the connected
            authentication backend.
          </p>
          <button className="primary" disabled={!DEMO}>
            Save profile
          </button>
        </form>
      </section>
    </>
  );
}
export function Support() {
  return (
    <>
      <PageHeading
        eyebrow="HERE TO HELP"
        title="Help & support"
        description="A few answers to keep your ideas moving."
      />
      <section className="card padded">
        <h2>How does hosting billing work?</h2>
        <p>
          Each website requires a separate $10 USD annual subscription. Domain
          aliases for the same website do not add subscriptions.
        </p>
        <h2>Why are some actions unavailable?</h2>
        <p>
          This frontend is awaiting the separate bbb-hosting-api contract.
          Production sign-in, payments, publication and remote file operations
          are unavailable until integration is verified.
        </p>
        <h2>Where is my demo data stored?</h2>
        <p>
          Demo changes stay in browser memory and reset on refresh. No real
          payments, deployments, or DNS changes occur.
        </p>
        <h2>Contact support</h2>
        <p>
          The official support contact will be added when confirmed by
          BuiltByBuzz.
        </p>
      </section>
    </>
  );
}
