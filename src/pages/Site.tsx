import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useOutletContext,
  useParams,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  FolderOpen,
  Globe2,
  GitBranch,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useApp } from "../app/state";
import { Badge, EmptyState, Modal, PageHeading } from "../components/ui";
import type { HostedWebsite, Domain } from "../types";
import { DEMO } from "../services/api";
import { initialDomains, initialDeployments } from "../services/demo";
export function SiteLayout() {
  const { siteId } = useParams();
  const location = useLocation();
  const { sites, projects } = useApp();
  const demoSite = sites.find((s) => s.id === siteId);
  const project = projects.find((item) => item.id === siteId);
  const site: HostedWebsite | undefined = DEMO
    ? demoSite
    : project
      ? {
          id: project.id,
          name: project.name,
          slug: project.slug,
          url: project.url,
          publication: "draft",
          entitlement: {
            siteId: project.id,
            source: "none",
            eligible: project.hostingStatus === "active",
          },
          subscription: {
            siteId: project.id,
            status: project.hostingStatus === "active" ? "active" : "draft",
            annualPriceUsd: 10,
          },
          updatedAt: project.createdAt || "",
        }
      : undefined;
  if (!site)
    return (
      <EmptyState
        title="Website not found"
        description="This website is not available in your workspace."
      />
    );
  if (
    !DEMO &&
    /\/(domains|deployments|billing|settings)$/.test(location.pathname)
  )
    return (
      <EmptyState
        title="This website area is not connected yet"
        description="Only project overview and file management are currently available for your real website."
      />
    );
  return (
    <>
      <Link className="back-link" to="/dashboard/sites">
        <ArrowLeft size={15} />
        All websites
      </Link>
      <PageHeading
        eyebrow="WEBSITE PROJECT"
        title={site.name}
        description={`Immutable website ID · ${site.id}`}
        action={
          <Badge
            value={DEMO ? site.publication : project?.hostingStatus || "inactive"}
            label={
              DEMO
                ? site.publication
                : project?.hostingStatus === "active"
                  ? "Hosting active"
                  : "Hosting inactive"
            }
          />
        }
      />
      <nav className="tabs">
        {(DEMO
          ? [
          ["Overview", ""],
          ["Files", "/files"],
          ["Domains", "/domains"],
          ["Deployments", "/deployments"],
          ["Billing", "/billing"],
          ["Settings", "/settings"],
            ]
          : [
              ["Overview", ""],
              ["Files", "/files"],
            ]
        ).map(([label, path]) => (
          <NavLink key={path} end to={`/dashboard/sites/${site.id}${path}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={site} />
    </>
  );
}
export function useSite() {
  return useOutletContext<HostedWebsite>();
}
export function SiteOverview() {
  const site = useSite();
  const { projects } = useApp();
  const project = projects.find((item) => item.id === site.id);
  if (!DEMO && project)
    return (
      <section className="card padded">
        <Globe2 className="cyan" />
        <h2>Your website</h2>
        <p>Primary hosting address</p>
        <a className="break-all" href={project.url} target="_blank" rel="noreferrer">
          {project.url}
          <ArrowUpRight size={15} />
        </a>
        <div className="detail-row">
          <span>Hosting status</span>
          <Badge
            value={project.hostingStatus}
            label={project.hostingStatus === "active" ? "Active" : "Inactive"}
          />
        </div>
        <p className="integration-note">
          Website files remain private while hosting is inactive. Uploading files does not publish or deploy this website.
        </p>
        <Link className="secondary" to="files">
          Manage website files <FolderOpen size={16} />
        </Link>
      </section>
    );
  return (
    <>
      <div className="details-grid">
        <section className="card padded">
          <Globe2 className="cyan" />
          <h2>Your website</h2>
          <p>Primary hosting address</p>
          <strong className="break-all">{site.url || "Not assigned"}</strong>
          {DEMO && (
            <p className="integration-note">
              Example address · not a live hosted website.
            </p>
          )}
          <div className="detail-row">
            <span>Publication</span>
            <Badge value={site.publication} />
          </div>
          <div className="detail-row">
            <span>Hosting entitlement</span>
            <strong>
              {site.entitlement.eligible ? "Eligible" : "Not activated"}
            </strong>
          </div>
          <div className="detail-row">
            <span>Entitlement source</span>
            <span>{site.entitlement.source.replaceAll("_", " ")}</span>
          </div>
        </section>
        <section className="card padded">
          <ShieldCheck className="gold" />
          <h2>Hosting for this website</h2>
          <p>$10 USD / year · one subscription for this project.</p>
          <div className="detail-row">
            <span>Billing status</span>
            <Badge value={site.subscription.status} />
          </div>
          <div className="detail-row">
            <span>Next renewal</span>
            <span>{site.subscription.renewalDate || "Not available"}</span>
          </div>
          <Link className="secondary" to="billing">
            Manage website billing <ArrowUpRight size={16} />
          </Link>
        </section>
      </div>
      <div className="quick-grid">
        {[
          [
            "Files",
            "Upload and organize your website files.",
            "files",
            FolderOpen,
          ],
          [
            "Domains",
            "Give your website a familiar address.",
            "domains",
            Globe2,
          ],
          [
            "Deployments",
            "Follow your website’s release history.",
            "deployments",
            GitBranch,
          ],
        ].map(([name, desc, path, Icon]) => {
          const I = Icon as typeof Globe2;
          return (
            <Link
              className="card padded quick-card"
              to={String(path)}
              key={String(path)}
            >
              <I className="cyan" />
              <h3>{String(name)}</h3>
              <p>{String(desc)}</p>
              <ArrowUpRight size={18} />
            </Link>
          );
        })}
      </div>
    </>
  );
}
export function SiteSettings() {
  const site = useSite();
  const { setSites, setNotice } = useApp();
  const [remove, setRemove] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <section className="card padded">
        <h2>Website settings</h2>
        <form
          key={site.id}
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(
              new FormData(e.currentTarget).get("name"),
            ).trim();
            if (!name) return;
            setSites((s) =>
              s.map((x) => (x.id === site.id ? { ...x, name } : x)),
            );
            setNotice("Demo website settings saved locally.");
          }}
        >
          <label>
            Website name
            <input
              name="name"
              defaultValue={site.name}
              required
              maxLength={80}
            />
          </label>
          <label>
            Website ID
            <input value={site.id} readOnly />
          </label>
          <p>
            Website IDs are permanent. Renaming a project does not change its ID
            or hosting entitlement.
          </p>
          <button className="primary" disabled={!DEMO}>
            Save changes
          </button>
        </form>
      </section>
      <section className="card padded danger-zone">
        <h2>Delete website</h2>
        <p>
          Remove this website and its local demo files. This cannot be undone in
          this session.
        </p>
        <button
          className="danger"
          disabled={!DEMO}
          onClick={() => setRemove(true)}
        >
          <Trash2 size={16} />
          Delete website
        </button>
      </section>
      {remove && (
        <Modal title="Delete this website?" onClose={() => setRemove(false)}>
          <p>{site.name} will be removed.</p>
          <p className="warning">
            {site.subscription.status === "active"
              ? "This website has an active subscription. Deleting a website does not automatically cancel Stripe billing. Manage its subscription separately."
              : "Check for any outstanding subscription before deleting this website."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSites((s) => s.filter((x) => x.id !== site.id));
              setNotice(
                "Demo website deleted locally. No real subscription was changed.",
              );
              navigate("/dashboard/sites");
            }}
          >
            <label>
              Type the website name to confirm
              <input
                required
                onChange={(e) =>
                  e.currentTarget.setCustomValidity(
                    e.currentTarget.value === site.name
                      ? ""
                      : "Enter the exact website name",
                  )
                }
              />
            </label>
            <button className="danger">Delete demo website</button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Domains() {
  const site = useSite();
  const { siteDomains, setSiteDomains } = useApp();
  const defaults =
    DEMO && site.url
      ? initialDomains(site.id).map((d) => ({
          ...d,
          hostname: site.url.replace("https://", ""),
        }))
      : [];
  const domains = siteDomains[site.id] ?? defaults;
  const setDomains = (update: (items: Domain[]) => Domain[]) =>
    setSiteDomains((current) => ({
      ...current,
      [site.id]: update(current[site.id] ?? defaults),
    }));
  const [adding, setAdding] = useState(false);
  const [remove, setRemove] = useState<Domain | null>(null);
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Domains</h2>
          <p>Multiple aliases, one website subscription.</p>
        </div>
        <button
          className="primary"
          disabled={!DEMO}
          onClick={() => setAdding(true)}
        >
          Add domain
        </button>
      </div>
      <section className="card padded">
        {domains.map((d) => (
          <div className="domain-row" key={d.id}>
            <Globe2 className="cyan" />
            <div className="grow">
              <strong>{d.hostname}</strong>
              <small>
                {d.assigned
                  ? "Assigned hosting address (example)"
                  : "Custom alias"}
              </small>
            </div>
            <Badge value={d.status} />
            {!d.assigned && (
              <button
                className="icon-button"
                aria-label={`Remove ${d.hostname}`}
                onClick={() => setRemove(d)}
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
        ))}
      </section>
      <section className="card padded">
        <h2>Connect your domain</h2>
        <p>
          Add an alias to receive backend-generated DNS instructions and
          verification status.
        </p>
        <div className="notice-box">
          DNS targets and verification tokens are unavailable until the API
          contract is connected. Do not configure DNS using these fictional
          addresses.
        </div>
        <p>
          Custom domain ownership does not include hosting. Each website project
          requires its own $10 annual subscription.
        </p>
      </section>
      {adding && (
        <Modal title="Add a demo domain alias" onClose={() => setAdding(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const hostname = String(
                new FormData(e.currentTarget).get("hostname"),
              )
                .trim()
                .toLowerCase();
              if (domains.some((d) => d.hostname === hostname)) return;
              setDomains((ds) => [
                ...ds,
                {
                  id: crypto.randomUUID(),
                  siteId: site.id,
                  hostname,
                  status: "pending",
                  assigned: false,
                },
              ]);
              setAdding(false);
            }}
          >
            <label>
              Domain name
              <input
                name="hostname"
                required
                pattern="([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}"
                placeholder="www.example.com"
              />
            </label>
            <p>Local simulation only. No DNS or hosting changes occur.</p>
            <button className="primary">Add demo alias</button>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal title="Remove domain alias?" onClose={() => setRemove(null)}>
          <p>Remove {remove.hostname} from this local demo website?</p>
          <button
            className="danger"
            onClick={() => {
              setDomains((ds) => ds.filter((d) => d.id !== remove.id));
              setRemove(null);
            }}
          >
            Remove alias
          </button>
        </Modal>
      )}
    </>
  );
}
export function Deployments() {
  const site = useSite();
  return (
    <section className="card padded">
      <h2>Deployment history</h2>
      <p>
        Fictional deployment examples. Real publication and entitlement checks
        belong to the backend.
      </p>
      {(DEMO ? initialDeployments(site.id) : []).map((d) => (
        <div className="domain-row" key={d.id}>
          <GitBranch className="cyan" />
          <div className="grow">
            <strong>{d.message}</strong>
            <small>
              {d.id} · {new Date(d.createdAt).toLocaleString()}
            </small>
          </div>
          <Badge value={d.status} />
        </div>
      ))}
    </section>
  );
}
