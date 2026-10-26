import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { HostedWebsite, UserAccount, HostedFile, Domain } from "../types";
import { ApiError, DEMO } from "../services/api";
import { auth } from "../services/auth";
import { initialSites } from "../services/demo";
const Context = createContext<ReturnType<typeof useAppState> | null>(null);
function useAppState() {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<HostedWebsite[]>(() =>
    DEMO ? initialSites() : [],
  );
  const [notice, setNotice] = useState("");
  const [siteFiles, setSiteFiles] = useState<Record<string, HostedFile[]>>({});
  const [siteDomains, setSiteDomains] = useState<Record<string, Domain[]>>({});
  useEffect(() => {
    if (!DEMO) {
      setSites([]);
      setSiteFiles({});
      setSiteDomains({});
    }
  }, [user?.id]);
  useEffect(() => {
    if (DEMO) return;
    const expire = () => {
      setUser(null);
      setSites([]);
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
