import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import type { ReactNode } from "react";
import { AppProvider, useApp } from "./state";
import { LoadingSkeleton, EmptyState } from "../components/ui";
import Layout from "../components/Layout";
import Login from "../pages/Login";
import Websites, { Overview } from "../pages/Websites";
import {
  SiteLayout,
  SiteOverview,
  SiteSettings,
  Domains,
  Deployments,
} from "../pages/Site";
import FileManager from "../pages/FileManager";
import GitHubSync from "../pages/GitHubSync";
import AccountBilling, { SiteBilling } from "../pages/Billing";
import Account, { Support } from "../pages/Account";
import OwnerInvitations from "../pages/OwnerInvitations";
import {
  AccessRestricted,
  InvitationLanding,
} from "../pages/Invitation";
import { getInvitationToken } from "../services/invitations";
import { DEMO } from "../services/api";

const router = createBrowserRouter([
  { path: "/invite", element: <InvitationLanding /> },
  { path: "/access-restricted", element: <AccessRestricted /> },
  { path: "/login", element: <Login key="login" /> },
  { path: "/register", element: <Registration /> },
  { path: "/forgot-password", element: <Login key="forgot" mode="forgot" /> },
  { path: "/verify-email", element: <Login key="verify" mode="verify" /> },
  { path: "/reset-password", element: <Login key="reset" mode="reset" /> },
  { path: "/signup", element: <Navigate to="/access-restricted" replace /> },
  {
    element: <Protected />,
    children: [
      {
        path: "/dashboard",
        element: <Layout />,
        children: [
          { index: true, element: <Overview /> },
          { path: "sites", element: <Websites /> },
          {
            path: "sites/:siteId",
            element: <SiteLayout />,
            children: [
              { index: true, element: <SiteOverview /> },
              { path: "files", element: <FileManager /> },
              { path: "github", element: <GitHubSync /> },
              { path: "domains", element: <Domains /> },
              { path: "deployments", element: <Deployments /> },
              { path: "billing", element: <SiteBilling /> },
              { path: "settings", element: <SiteSettings /> },
            ],
          },
          { path: "billing", element: <AccountBilling /> },
          { path: "account", element: <Account /> },
          {
            path: "invitations",
            element: (
              <OwnerProtected>
                <OwnerInvitations />
              </OwnerProtected>
            ),
          },
          { path: "support", element: <Support /> },
          {
            path: "*",
            element: (
              <EmptyState
                title="Page not found"
                description="Use the navigation to return to your workspace."
              />
            ),
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/access-restricted" replace /> },
]);

function Protected() {
  const location = useLocation();
  const { user, loading } = useApp();
  if (loading) return <LoadingSkeleton />;
  return user && (user.prealphaAccess || DEMO) ? (
    <Outlet />
  ) : (
    <Navigate to={user ? "/access-restricted" : "/login"} state={{ from: location.pathname + location.search }} replace />
  );
}

function Registration() {
  return getInvitationToken() ? (
    <Login key="register" signUp />
  ) : (
    <Navigate to="/access-restricted" replace />
  );
}

function OwnerProtected({ children }: { children: ReactNode }) {
  const { user, loading } = useApp();
  if (loading) return <LoadingSkeleton />;
  return user?.role === "owner" ? (
    children
  ) : (
    <EmptyState
      title="Owner access required"
      description="Invitation management is available only to the platform owner."
    />
  );
}
export default function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}
