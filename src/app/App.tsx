import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
} from "react-router-dom";
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
import AccountBilling, { SiteBilling } from "../pages/Billing";
import Account, { Support } from "../pages/Account";

const router = createBrowserRouter([
  { path: "/login", element: <Login key="login" /> },
  { path: "/register", element: <Login key="register" signUp /> },
  { path: "/forgot-password", element: <Login key="forgot" mode="forgot" /> },
  { path: "/verify-email", element: <Login key="verify" mode="verify" /> },
  { path: "/reset-password", element: <Login key="reset" mode="reset" /> },
  { path: "/signup", element: <Login key="signup" signUp /> },
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
              { path: "domains", element: <Domains /> },
              { path: "deployments", element: <Deployments /> },
              { path: "billing", element: <SiteBilling /> },
              { path: "settings", element: <SiteSettings /> },
            ],
          },
          { path: "billing", element: <AccountBilling /> },
          { path: "account", element: <Account /> },
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
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);

function Protected() {
  const location = useLocation();
  const { user, loading } = useApp();
  if (loading) return <LoadingSkeleton />;
  return user ? (
    <Outlet />
  ) : (
    <Navigate
      to="/login"
      state={{ from: location.pathname + location.search }}
      replace
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
