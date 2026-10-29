import { useRef, useState, type FormEvent } from "react";
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
import { ApiError, DEMO } from "../services/api";
import {
  projects as projectApi,
  validateProjectName,
  validateProjectSlug,
} from "../services/projects";
import { summarize } from "../services/billing";
import type { HostedProject } from "../types";
type WebsiteRow = Pick<
  HostedProject,
  "id" | "name" | "slug" | "url" | "hostingStatus" | "createdAt"
> & {
  publication?: "published" | "draft";
  billingStatus?: string;
};
function slugFromName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63)
    .replace(/-$/, "");
}
export function CreateWebsite() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const { setSites, setNotice, reloadProjects } = useApp();
  const openForm = () => {
    setName("");
    setSlug("");
    setSlugEdited(false);
    setError("");
    setOpen(true);
  };
  const closeForm = () => {
    if (!submittingRef.current) setOpen(false);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const cleanName = name.trim();
    const cleanSlug = slug.trim().toLowerCase();
    const nameError = validateProjectName(cleanName);
    const slugError = validateProjectSlug(cleanSlug);
    if (nameError || slugError) {
      setError(nameError || slugError || "Please check your website details.");
      return;
    }

    setError("");
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (DEMO) {
        const id = crypto.randomUUID();
        setSites((sites) => [
          {
            id,
            name: cleanName,
            slug: cleanSlug,
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
          ...sites,
        ]);
        setNotice("Demo website created locally. Hosting is not activated.");
      } else {
        await projectApi.create(cleanName, cleanSlug);
        reloadProjects();
        setNotice(
          "Website created. Hosting remains inactive until you activate it.",
        );
      }
      setOpen(false);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : "Could not create your website. Please try again.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  return (
    <>
      <button
        className="primary"
        onClick={openForm}
      >
        <Plus size={17} />
        Create website
      </button>
      {open && (
        <Modal
          title="A new home for your idea"
          onClose={closeForm}
          closeDisabled={submitting}
        >
          <p>
            {DEMO
              ? "Create a local demo draft. Hosting requires a separate $10 annual subscription for this website."
              : "Choose a name and a subdomain for your website. Hosting stays inactive until you activate it."}
          </p>
          <form onSubmit={submit} noValidate>
            <label>
              Website name
              <input
                autoFocus
                name="name"
                required
                maxLength={80}
                aria-label="Website name"
                value={name}
                onChange={(event) => {
                  const value = event.target.value;
                  setName(value);
                  if (!slugEdited) setSlug(slugFromName(value));
                  setError("");
                }}
                aria-describedby="website-name-help"
                disabled={submitting}
                placeholder="My Awesome Website"
              />
              <small id="website-name-help">Up to 80 characters.</small>
            </label>
            <label>
              Subdomain
              <input
                name="slug"
                value={slug}
                required
                onChange={(event) => {
                  setSlugEdited(true);
                  setSlug(event.target.value.toLowerCase());
                  setError("");
                }}
                maxLength={63}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="website-address-preview"
                disabled={submitting}
                placeholder="my-awesome-website"
              />
              <small
                className="website-address-preview"
                id="website-address-preview"
                aria-live="polite"
              >
                Preview:{" "}
                <strong>
                  {slug || "your-subdomain"}.builtbybuzz.dev
                </strong>
              </small>
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={closeForm}
                disabled={submitting}
              >
                Cancel
              </button>
              <button className="primary" disabled={submitting}>
                {submitting
                  ? "Creating…"
                  : DEMO
                    ? "Create demo draft"
                    : "Create website"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function SiteTable({ recent = false }: { recent?: boolean }) {
  const {
    sites: demoSites,
    projects,
    projectsLoading,
    projectsError,
    reloadProjects,
  } = useApp();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const rows: WebsiteRow[] = DEMO
    ? demoSites.map((site) => ({
        id: site.id,
        name: site.name,
        slug: site.slug,
        url: site.url,
        hostingStatus:
          site.subscription.status === "active" ? "active" : "inactive",
        createdAt: site.updatedAt,
        publication: site.publication,
        billingStatus: site.subscription.status,
      }))
    : projects;
  const visible = rows
    .filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) &&
        (filter === "all" ||
          (DEMO
            ? s.publication === filter || s.billingStatus === filter
            : s.hostingStatus === filter)),
    )
    .slice(0, recent ? 4 : undefined);
  return (
    <section className="card site-list">
      <div className="section-heading">
        <div>
          <h2>
            {recent ? "Recent websites" : "Your websites"}{" "}
            <span className="number">{rows.length}</span>
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
            {DEMO ? (
              <>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="active">Billing active</option>
                <option value="suspended">Suspended</option>
                <option value="pending_payment">Pending payment</option>
              </>
            ) : (
              <>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </>
            )}
          </select>
        </div>
      )}
      {projectsLoading ? (
        <p className="projects-message" role="status">
          Loading your websites…
        </p>
      ) : projectsError ? (
        <div className="projects-message" role="alert">
          <p>{projectsError}</p>
          <button className="secondary" onClick={reloadProjects}>
            Try again
          </button>
        </div>
      ) : visible.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>WEBSITE</th>
                <th>{DEMO ? "PUBLICATION" : "HOSTING STATUS"}</th>
                {DEMO && <th>HOSTING BILLING</th>}
                <th>{DEMO ? "LAST UPDATED" : "CREATED"}</th>
                {DEMO && (
                  <th>
                    <span className="sr-only">Manage</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((site, i) => (
                <tr key={site.id}>
                  <td>
                    <div className="website-cell">
                      {DEMO ? (
                        <Link
                          to={`/dashboard/sites/${site.id}`}
                          className="website-name"
                        >
                          <div className={`site-icon color-${i % 4}`}>
                            <Globe2 size={21} />
                          </div>
                          <div>
                            <strong>{site.name}</strong>
                            <small>
                              {site.url
                                ? site.url.replace("https://", "")
                                : "No address assigned"}
                            </small>
                          </div>
                        </Link>
                      ) : (
                        <div className="website-name">
                          <div className={`site-icon color-${i % 4}`}>
                            <Globe2 size={21} />
                          </div>
                          <div>
                            <strong>{site.name}</strong>
                          </div>
                        </div>
                      )}
                      {!DEMO && (
                        <a
                          className="project-url"
                          href={site.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {site.slug}.builtbybuzz.dev
                        </a>
                      )}
                    </div>
                  </td>
                  <td>
                    {DEMO ? (
                      <Badge value={site.publication ?? "draft"} />
                    ) : (
                      <Badge
                        value={site.hostingStatus}
                        label={
                          site.hostingStatus === "active"
                            ? "Active"
                            : "Inactive"
                        }
                      />
                    )}
                  </td>
                  {DEMO && (
                    <td>
                      <Badge value={site.billingStatus ?? "draft"} />
                    </td>
                  )}
                  <td className="muted date">{site.createdAt || "—"}</td>
                  {DEMO && (
                    <td>
                      <Link
                        className="manage"
                        to={`/dashboard/sites/${site.id}`}
                      >
                        Manage <ArrowUpRight size={15} />
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={rows.length ? "No websites found" : "No websites yet"}
          description={
            rows.length
              ? "Try a different search or status filter."
              : DEMO
                ? "Create your first demo website to get started."
                : "Projects you own will appear here."
          }
        />
      )}
    </section>
  );
}
export function Overview() {
  const { sites, projects, user } = useApp();
  const summary = summarize(sites.map((s) => s.subscription));
  const stats = DEMO
    ? [
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
      ] as const
    : [
        [
          "Total websites",
          projects.length,
          Layers,
          "All your projects",
          "cyan",
        ],
        [
          "Active hosting",
          projects.filter((project) => project.hostingStatus === "active")
            .length,
          CheckCircle2,
          "Ready for your next idea",
          "green",
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
      <div className={`stats ${DEMO ? "" : "projects-summary"}`}>
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
      {DEMO && (
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
      )}
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
