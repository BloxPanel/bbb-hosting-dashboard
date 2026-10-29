import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useMatch, Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Globe2,
  CreditCard,
  Settings,
  LifeBuoy,
  PanelLeftClose,
  Menu,
  ChevronDown,
  ArrowUpRight,
  LogOut,
  X,
  FolderOpen,
  GitBranch,
} from "lucide-react";
import { useApp } from "../app/state";
import { ApiError, DEMO } from "../services/api";
import { auth } from "../services/auth";
export default function Layout() {
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 700px)").matches,
  );
  const asideRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => {
      setMobile(query.matches);
      setOpen(false);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const { user, setUser, setNotice, sites, projects } = useApp();
  const siteId = useMatch("/dashboard/sites/:siteId/*")?.params.siteId;
  const initials =
    user?.name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("") || "?";
  useEffect(() => {
    if (!open || !mobile) return;
    const menuButton = menuRef.current;
    const items = () =>
      Array.from(
        asideRef.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled])",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    items()[0]?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab") {
        const focusable = items();
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      menuButton?.focus();
    };
  }, [open, mobile]);
  const nav = [
    ["Overview", "/dashboard", LayoutDashboard],
    ["Websites", "/dashboard/sites", Globe2],
    ["Billing", "/dashboard/billing", CreditCard],
    ["Account settings", "/dashboard/account", Settings],
  ] as const;
  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <a href="#main" className="skip">
        Skip to content
      </a>
      {open && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={asideRef}
        className={open ? "open" : ""}
        inert={mobile && !open}
        role={mobile && open ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Workspace navigation"
      >
        <Link className="brand" to="/dashboard">
          <span className="brand-name">
            BuiltBy<span>Buzz</span>
            <small>HOSTING CONSOLE</small>
          </span>
        </Link>
        <div className="workspace">
          <div className="avatar">{initials}</div>
          <div className="sidebar-label">
            <strong>{DEMO ? "Demo workspace" : "My workspace"}</strong>
            <small>Personal account</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption sidebar-label">WORKSPACE</div>
        <nav>
          {nav.map(([label, to, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/dashboard"}
              title={label}
              onClick={() => setOpen(false)}
            >
              <Icon size={19} />
              <span className="sidebar-label">{label}</span>
              {label === "Websites" && (
                <small className="count sidebar-label">
                  {DEMO ? sites.length : projects.length}
                </small>
              )}
            </NavLink>
          ))}
          {siteId && (
            <>
              <div className="nav-caption sidebar-label">CURRENT WEBSITE</div>
              {[
                ...(DEMO
                  ? [
                      ["Overview", "", Globe2],
                      ["Files", "/files", FolderOpen],
                      ["Domains", "/domains", Globe2],
                      ["Deployments", "/deployments", GitBranch],
                      ["Billing", "/billing", CreditCard],
                      ["Settings", "/settings", Settings],
                    ]
                  : [
                      ["Overview", "", Globe2],
                      ["Files", "/files", FolderOpen],
                    ]),
              ].map(([label, path, Icon]) => {
                const I = Icon as typeof Globe2;
                return (
                  <NavLink
                    key={String(path)}
                    to={`/dashboard/sites/${siteId}${path}`}
                    title={String(label)}
                    end
                    onClick={() => setOpen(false)}
                  >
                    <I size={18} />
                    <span className="sidebar-label">{String(label)}</span>
                  </NavLink>
                );
              })}
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card sidebar-label">
            <span className="eyebrow">SMALL PRICE. BIG POSSIBILITIES.</span>
            <h3>Your ideas, online.</h3>
            <p>
              Simple hosting.
              <br />
              Just $10 / website / year.
            </p>
            <Link to="/dashboard/billing" onClick={() => setOpen(false)}>
              Explore hosting <ArrowUpRight size={15} />
            </Link>
          </div>
          <Link
            className="support"
            to="/dashboard/support"
            onClick={() => setOpen(false)}
          >
            <LifeBuoy size={19} />
            <span className="sidebar-label">Help & support</span>
            <ArrowUpRight className="sidebar-label" size={15} />
          </Link>
          <button
            className="collapse"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle sidebar"
          >
            <PanelLeftClose size={18} />
            <span className="sidebar-label">Collapse sidebar</span>
          </button>
        </div>
      </aside>
      <div className="main-wrap" inert={mobile && open}>
        <header>
          <div className="row">
            <button
              ref={menuRef}
              className="mobile-menu icon-button"
              aria-expanded={open}
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </button>
            <span className="muted">Workspace</span>
            <span className="slash">/</span>
            <strong>Hosting dashboard</strong>
          </div>
          <div className="row">
            <span className="environment">
              <i />
              {DEMO ? "Development" : "Production"}
            </span>
            <Link
              to="/dashboard/account"
              className="avatar small"
              aria-label="Account"
            >
              {initials}
            </Link>
            <button
              className="icon-button"
              aria-label="Log out"
              disabled={loggingOut}
              onClick={async () => {
                if (loggingOut) return;
                setLoggingOut(true);
                try {
                  if (!DEMO) await auth.logout();
                  setUser(null);
                  navigate("/login", { replace: true });
                } catch (e) {
                  if (e instanceof ApiError && e.status === 401) {
                    setUser(null);
                    navigate("/login", { replace: true });
                  } else
                    setNotice(
                      e instanceof Error
                        ? e.message
                        : "Could not log out. Please try again.",
                    );
                } finally {
                  setLoggingOut(false);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        {DEMO && (
          <div className="demo-banner">
            <span>
              <span className="demo-tag">DEMO MODE</span> You’re exploring a
              fictional workspace. Changes stay in this session.
            </span>
            <span className="muted">No real hosting or payments</span>
          </div>
        )}
        <main id="main">
          <Outlet />
        </main>
        <footer>
          <span>© {new Date().getFullYear()} BuiltByBuzz</span>
          <span>
            {user?.email} <span className="footer-dot">·</span> One website. One
            subscription.
          </span>
        </footer>
      </div>
      <Notice />
    </div>
  );
}
function Notice() {
  const { notice, setNotice } = useApp();
  return notice ? (
    <div className="toast" role="alert">
      {notice}
      <button onClick={() => setNotice("")} aria-label="Dismiss notification">
        <X size={17} />
      </button>
    </div>
  ) : null;
}
