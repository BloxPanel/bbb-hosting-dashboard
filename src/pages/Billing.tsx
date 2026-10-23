import { Link } from "react-router-dom";
import { CreditCard, ShieldCheck, ArrowUpRight } from "lucide-react";
import { useApp } from "../app/state";
import { useSite } from "./Site";
import { Badge, PageHeading } from "../components/ui";
import { DEMO } from "../services/api";
import { summarize } from "../services/billing";
export function SiteBilling() {
  const site = useSite();
  const { setNotice } = useApp();
  const active = site.subscription.status === "active";
  const suspended = site.subscription.status === "suspended";
  return (
    <div className="details-grid">
      <section className="card padded billing-plan">
        <CreditCard className="gold" size={28} />
        <span className="eyebrow">HOSTING · THIS WEBSITE ONLY</span>
        <h2>
          {active
            ? "Hosting active"
            : suspended
              ? "Hosting suspended"
              : "Hosting not activated"}
        </h2>
        <p>{site.name}</p>
        <div className="price">
          $10 <span>USD / year</span>
        </div>
        <Badge value={site.subscription.status} />
        <div className="detail-row">
          <span>Next renewal</span>
          <strong>{site.subscription.renewalDate || "Not available"}</strong>
        </div>
        <button
          className="primary full"
          onClick={() =>
            setNotice(
              "Billing integration is not connected. No payment was taken and no entitlement was changed.",
            )
          }
          disabled={!DEMO}
        >
          {active
            ? "Manage subscription"
            : suspended
              ? "Reactivate hosting"
              : "Activate hosting — $10/year"}
          <ArrowUpRight size={16} />
        </button>
        <p className="integration-note">
          Checkout and subscription management are unavailable until the backend
          is connected. Demo payments are never simulated as successful.
        </p>
      </section>
      <section className="card padded">
        <ShieldCheck className="cyan" />
        <h2>One website. One subscription.</h2>
        <p>
          This subscription covers only <strong>{site.name}</strong>. Your other
          websites have their own subscriptions and billing statuses.
        </p>
        <ul className="feature-list">
          <li>Annual hosting for one website project</li>
          <li>Multiple domain aliases for the same project</li>
          <li>Publication is managed separately from billing</li>
          <li>Owner hosting grants must be verified by the backend</li>
        </ul>
        <div className="notice-box">
          An active subscription makes a website eligible for publication. It
          does not publish it automatically.
        </div>
      </section>
    </div>
  );
}
export default function AccountBilling() {
  const { sites } = useApp();
  const summary = summarize(sites.map((s) => s.subscription));
  return (
    <>
      <PageHeading
        eyebrow="SIMPLE, PREDICTABLE HOSTING"
        title="Billing"
        description="Your website subscriptions. Each one has a home of its own."
      />
      <div className="stats billing-stats">
        <section className="card stat">
          <span>Active subscriptions</span>
          <strong>{summary.activeSubscriptions}</strong>
          <small>Each covers one website</small>
        </section>
        <section className="card stat">
          <span>Expected annual base cost</span>
          <strong>
            ${summary.expectedAnnualBaseCost}
            <small> / year</small>
          </strong>
          <small>$10 per active website subscription</small>
        </section>
      </div>
      <section className="card">
        <div className="section-heading">
          <h2>Website subscriptions</h2>
          <span className="tiny-tag">USD · ANNUAL</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>WEBSITE</th>
                <th>ANNUAL BASE PRICE</th>
                <th>BILLING STATUS</th>
                <th>NEXT RENEWAL</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                  </td>
                  <td>$10 / year</td>
                  <td>
                    <Badge value={s.subscription.status} />
                  </td>
                  <td>{s.subscription.renewalDate || "—"}</td>
                  <td>
                    <Link
                      className="text-link"
                      to={`/dashboard/sites/${s.id}/billing`}
                    >
                      Manage <ArrowUpRight size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="notice-box">
        Billing is per website project, not per account or domain. Pending,
        canceled and suspended subscriptions are excluded from the active annual
        base cost. Actual invoices, taxes and renewal amounts come from the
        backend.
      </div>
    </>
  );
}
