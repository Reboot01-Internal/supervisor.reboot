import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

type AuthState = {
  jwt: string;
  role: string;
  email: string;
  login: string;
  displayName: string;
};

type AuthContextValue = AuthState & {
  isAdmin: boolean;
  isSupervisor: boolean;
  isStudent: boolean;
  authenticated: boolean;
  setSession: (s: AuthState) => void;
  setDisplayName: (displayName: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStorage(): AuthState {
  return {
    jwt: (localStorage.getItem("jwt") || "").trim().replace(/^"|"$/g, ""),
    role: (localStorage.getItem("role") || "").trim().toLowerCase(),
    email: (localStorage.getItem("email") || "").trim(),
    login: (localStorage.getItem("login") || "").trim(),
    displayName: (localStorage.getItem("displayName") || "").trim(),
  };
}

function isJwtValid(raw: string): boolean {
  if (!raw) return false;
  try {
    const parts = raw.split(".");
    if (parts.length < 2) return false;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));
    if (!payload.exp) return true;
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const [state, setState] = useState<AuthState>(readStorage);

  const logout = useCallback(() => {
    document.body.classList.remove("admin-dark-theme");
    localStorage.removeItem("jwt");
    localStorage.removeItem("role");
    localStorage.removeItem("email");
    localStorage.removeItem("login");
    localStorage.removeItem("displayName");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setState({ jwt: "", role: "", email: "", login: "", displayName: "" });
    nav("/login", { replace: true });
  }, [nav]);

  const setSession = useCallback((s: AuthState) => {
    localStorage.setItem("jwt", s.jwt);
    localStorage.setItem("role", s.role);
    localStorage.setItem("email", s.email);
    localStorage.setItem("login", s.login);
    localStorage.setItem("displayName", s.displayName);
    setState(s);
  }, []);

  const setDisplayName = useCallback((displayName: string) => {
    const nextName = String(displayName || "").trim();
    localStorage.setItem("displayName", nextName);
    setState((prev) => ({ ...prev, displayName: nextName }));
  }, []);

  useEffect(() => {
    const onForceLogout = () => logout();
    window.addEventListener("auth:logout", onForceLogout);
    return () => window.removeEventListener("auth:logout", onForceLogout);
  }, [logout]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (["jwt", "role", "email", "login", "displayName"].includes(e.key || "")) {
        setState(readStorage());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const authenticated = isJwtValid(state.jwt);
    return {
      ...state,
      authenticated,
      isAdmin: state.role === "admin",
      isSupervisor: state.role === "supervisor",
      isStudent: state.role === "student",
      setSession,
      setDisplayName,
      logout,
    };
  }, [state, setSession, setDisplayName, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
