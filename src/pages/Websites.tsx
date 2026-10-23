import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  ArrowUpRight,
  Globe2,
  ArrowRight,
  Layers,
  CheckCircle2,
  FileText,
  PauseCircle,
  CreditCard,
} from "lucide-react";
import { useApp } from "../app/state";
import { Badge, EmptyState, Modal, PageHeading } from "../components/ui";
import { DEMO } from "../services/api";
import { summarize } from "../services/billing";
export function CreateWebsite() {
  const [open, setOpen] = useState(false);
  const { setSites, setNotice } = useApp();
  return (
    <>
      <button
        className="primary"
        disabled={!DEMO}
        onClick={() => setOpen(true)}
      >
        <Plus size={17} />
        Create website
      </button>
      {open && (
        <Modal title="A new home for your idea" onClose={() => setOpen(false)}>
          <p>
            Create a local demo draft. Hosting requires a separate $10 annual
            subscription for this website.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(
                new FormData(e.currentTarget).get("name"),
              ).trim();
              if (!name) return;
              const id = crypto.randomUUID();
              setSites((s) => [
                {
                  id,
                  name,
                  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                  url: "",
                  publication: "draft",
                  entitlement: { siteId: id, source: "none", eligible: false },
                  subscription: {
                    siteId: id,
                    status: "draft",
                    annualPriceUsd: 10,
                  },
                  updatedAt: new Date().toISOString().slice(0, 10),
                },
                ...s,
              ]);
              setOpen(false);
              setNotice(
                "Demo website created locally. Hosting is not activated.",
              );
            }}
          >
            <label>
              Website name
              <input
                autoFocus
                name="name"
                required
                maxLength={80}
                placeholder="My next big idea"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="primary">Create demo draft</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function SiteTable({ recent = false }: { recent?: boolean }) {
  const { sites } = useApp();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const visible = sites
    .filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) &&
        (filter === "all" ||
          s.publication === filter ||
          s.subscription.status === filter),
    )
    .slice(0, recent ? 4 : undefined);
  return (
    <section className="card site-list">
      <div className="section-heading">
        <div>
          <h2>
            {recent ? "Recent websites" : "Your websites"}{" "}
            <span className="number">{sites.length}</span>
          </h2>
          <p>
            {recent
              ? "A little overview of what you’ve been building."
              : "Every project, in one place."}
          </p>
        </div>
        {recent ? (
          <Link className="text-link" to="/dashboard/sites">
            View all websites <ArrowRight size={16} />
          </Link>
        ) : null}
      </div>
      {!recent && (
        <div className="filters">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Search websites"
              placeholder="Search websites…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter website status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="active">Billing active</option>
            <option value="suspended">Suspended</option>
            <option value="pending_payment">Pending payment</option>
          </select>
        </div>
      )}
      {visible.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>WEBSITE</th>
                <th>PUBLICATION</th>
                <th>HOSTING BILLING</th>
                <th>LAST UPDATED</th>
                <th>
                  <span className="sr-only">Manage</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s, i) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      to={`/dashboard/sites/${s.id}`}
                      className="website-name"
                    >
                      <div className={`site-icon color-${i % 4}`}>
                        <Globe2 size={21} />
                      </div>
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          {s.url
                            ? s.url.replace("https://", "")
                            : "No address assigned"}
                        </small>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <Badge value={s.publication} />
                  </td>
                  <td>
                    <Badge value={s.subscription.status} />
                  </td>
                  <td className="muted date">{s.updatedAt}</td>
                  <td>
                    <Link className="manage" to={`/dashboard/sites/${s.id}`}>
                      Manage <ArrowUpRight size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No websites found"
          description="Try a different search or create your first website."
        />
      )}
    </section>
  );
}
export function Overview() {
  const { sites, user } = useApp();
  const summary = summarize(sites.map((s) => s.subscription));
  const stats = [
    ["Total websites", sites.length, Layers, "All your projects", "cyan"],
    [
      "Active hosting",
      summary.activeSubscriptions,
      CheckCircle2,
      "Ready for your next idea",
      "green",
    ],
    [
      "Draft websites",
      sites.filter((s) => s.publication === "draft").length,
      FileText,
      "A work in progress",
      "gold",
    ],
    [
      "Suspended",
      sites.filter((s) => s.subscription.status === "suspended").length,
      PauseCircle,
      "Hosting needs attention",
      "rose",
    ],
  ] as const;
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE, AT A GLANCE"
        title={`Welcome back, ${user?.name.split(" ")[0] ?? "there"}.`}
        description="Big ideas. Little websites. Everything you need to keep them running."
        action={<CreateWebsite />}
      />
      <div className="stats">
        {stats.map(([label, value, Icon, caption, color]) => (
          <div className="card stat" key={label}>
            <div className="row between">
              <span>{label}</span>
              <Icon className={color} size={18} />
            </div>
            <strong>{value.toString().padStart(2, "0")}</strong>
            <small>
              <i className={color} />
              {caption}
            </small>
          </div>
        ))}
      </div>
      <div className="hosting-strip">
        <div className="strip-icon">
          <CreditCard size={24} />
        </div>
        <div>
          <h3>Simple hosting. No surprises.</h3>
          <p>
            {summary.activeSubscriptions} active website subscriptions{" "}
            <span>·</span> $10 per website, per year
          </p>
        </div>
        <div className="annual">
          <strong>
            ${summary.expectedAnnualBaseCost}
            <small> / year</small>
          </strong>
          <span>Expected annual base cost</span>
        </div>
        <Link to="/dashboard/billing" className="secondary">
          View billing <ArrowUpRight size={15} />
        </Link>
      </div>
      <SiteTable recent />
      <div className="bottom-grid">
        <section className="card next-project">
          <div className="eyebrow">MAKE ROOM FOR WHAT’S NEXT</div>
          <h2>Your next idea belongs online.</h2>
          <p>
            A portfolio, a passion project, or something entirely new.
            <br />
            Give it a home in just a few clicks.
          </p>
          <CreateWebsite />
          <div className="orbital" aria-hidden="true">
            <Globe2 size={96} />
          </div>
        </section>
        <section className="card getting-started">
          <div className="row between">
            <h2>A good place to start</h2>
            <span className="tiny-tag">QUICK LINKS</span>
          </div>
          {[
            [
              "Manage your websites",
              "Upload files, connect domains, make it yours.",
              "/dashboard/sites",
            ],
            [
              "Understand your hosting",
              "One website. One $10 annual subscription.",
              "/dashboard/billing",
            ],
            [
              "Need a helping hand?",
              "Let’s get your project moving.",
              "/dashboard/support",
            ],
          ].map(([title, desc, url]) => (
            <Link key={title} to={url}>
              <span>
                <strong>{title}</strong>
                <small>{desc}</small>
              </span>
              <ArrowUpRight size={17} />
            </Link>
          ))}
        </section>
      </div>
    </>
  );
}
export default function Websites() {
  return (
    <>
      <PageHeading
        eyebrow="BUILD SOMETHING GOOD"
        title="Websites"
        description="A home for every project. Manage all of yours here."
        action={<CreateWebsite />}
      />
      <SiteTable />
    </>
  );
}
