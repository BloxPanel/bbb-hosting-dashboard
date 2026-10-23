import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
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
function Protected() {
  const { user, loading } = useApp();
  if (loading) return <LoadingSkeleton />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login key="login" />} />
          <Route path="/signup" element={<Login key="signup" signUp />} />
          <Route element={<Protected />}>
            <Route path="/dashboard" element={<Layout />}>
              <Route index element={<Overview />} />
              <Route path="sites" element={<Websites />} />
              <Route path="sites/:siteId" element={<SiteLayout />}>
                <Route index element={<SiteOverview />} />
                <Route path="files" element={<FileManager />} />
                <Route path="domains" element={<Domains />} />
                <Route path="deployments" element={<Deployments />} />
                <Route path="billing" element={<SiteBilling />} />
                <Route path="settings" element={<SiteSettings />} />
              </Route>
              <Route path="billing" element={<AccountBilling />} />
              <Route path="account" element={<Account />} />
              <Route path="support" element={<Support />} />
              <Route
                path="*"
                element={
                  <EmptyState
                    title="Page not found"
                    description="Use the navigation to return to your workspace."
                  />
                }
              />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
