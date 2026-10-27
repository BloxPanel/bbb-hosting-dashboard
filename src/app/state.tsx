import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type {
  HostedWebsite,
  HostedProject,
  UserAccount,
  HostedFile,
  Domain,
} from "../types";
import { ApiError, DEMO } from "../services/api";
import { auth } from "../services/auth";
import { initialSites } from "../services/demo";
import { projects as projectApi } from "../services/projects";
const Context = createContext<ReturnType<typeof useAppState> | null>(null);
function useAppState() {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<HostedWebsite[]>(() =>
    DEMO ? initialSites() : [],
  );
  const [projects, setProjects] = useState<HostedProject[]>([]);
  const [projectsOwnerId, setProjectsOwnerId] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");
  const [projectRefresh, setProjectRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [siteFiles, setSiteFiles] = useState<Record<string, HostedFile[]>>({});
  const [siteDomains, setSiteDomains] = useState<Record<string, Domain[]>>({});
  const userId = user?.id;
  useEffect(() => {
    if (DEMO) return;
    setProjects([]);
    setProjectsOwnerId(null);
    setSiteFiles({});
    setSiteDomains({});
    setProjectsError("");
    if (!userId) {
      setProjectsLoading(false);
      return;
    }

    let active = true;
    setProjectsLoading(true);
    projectApi
      .list()
      .then((accountProjects) => {
        if (active) {
          setProjects(accountProjects);
          setProjectsOwnerId(userId);
        }
      })
      .catch((error: unknown) => {
        if (active)
          setProjectsError(
            error instanceof Error
              ? error.message
              : "Could not load your websites. Please try again.",
          );
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, projectRefresh]);
  useEffect(() => {
    if (DEMO) return;
    const expire = () => {
      setUser(null);
      setProjects([]);
      setProjectsOwnerId(null);
      setSiteFiles({});
      setSiteDomains({});
    };
    window.addEventListener("bbb-session-expired", expire);
    return () => window.removeEventListener("bbb-session-expired", expire);
  }, []);
  useEffect(() => {
    let active = true;
    if (DEMO) {
      setLoading(false);
      return;
    }
    auth
      .session()
      .then((account) => {
        if (active) setUser(account);
      })
      .catch((error) => {
        if (active) {
          setUser(null);
          if (!(error instanceof ApiError && error.status === 401))
            setNotice(error.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return {
    user,
    setUser,
    loading,
    sites,
    setSites,
    projects: !DEMO && projectsOwnerId === user?.id ? projects : [],
    projectsLoading:
      !DEMO &&
      Boolean(user) &&
      (projectsLoading ||
        (projectsOwnerId !== user?.id && !projectsError)),
    projectsError,
    reloadProjects: () => setProjectRefresh((refresh) => refresh + 1),
    notice,
    setNotice,
    siteFiles,
    setSiteFiles,
    siteDomains,
    setSiteDomains,
  };
}
export function AppProvider({ children }: { children: ReactNode }) {
  const value = useAppState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing provider");
  return value;
}
