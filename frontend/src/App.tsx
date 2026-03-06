import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/AdminDashboard";
import SupervisorsPage from "./pages/SupervisorsPage";
import SupervisorFilePage from "./pages/SupervisorFilePage";
import BoardMembersPage from "./pages/BoardMembersPage";
import type { JSX } from "react";
import BoardPage from "./pages/BoardPage";
import AdminBoardsPage from "./pages/AdminBoardsPage";
import AssignPage from "./pages/AssignPage";

// ✅ change this to your real dashboard page
// import DashboardPage from "./pages/DashboardPage";

function normalizeToken(raw: string) {
  return raw.trim().replace(/^"|"$/g, "");
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function hasValidJwt(): boolean {
  const raw = localStorage.getItem("jwt");
  if (!raw) return false;

  const token = normalizeToken(raw);
  const payload = decodeJwtPayload(token);
  if (!payload) return false;

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp) return true; // dev
  return payload.exp > now;
}

function getRole(): string {
  return (localStorage.getItem("role") || "").trim().toLowerCase();
}

// ✅ must be logged in (JWT)
function RequireAuth({ children }: { children: JSX.Element }) {
  if (!hasValidJwt()) return <Navigate to="/login" replace />;
  return children;
}

// ✅ must be admin
function RequireAdmin({ children }: { children: JSX.Element }) {
  if (!hasValidJwt()) return <Navigate to="/login" replace />;

  const role = getRole();
  if (role !== "admin") return <Navigate to="/dashboard" replace />;

  return children;
}

function RequireBoardsAccess({ children }: { children: JSX.Element }) {
  if (!hasValidJwt()) return <Navigate to="/login" replace />;
  const role = getRole();
  if (role !== "admin" && role !== "supervisor" && role !== "student") {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* ✅ Normal dashboard route (non-admin users land here) */}
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Navigate to="/admin/boards" replace />
          </RequireAuth>
        }
      />

      {/* ✅ Admin routes are protected by RequireAdmin */}
      <Route
        path="/admin"
        element={
          getRole() === "admin" ? (
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          ) : (
            <RequireBoardsAccess>
              <Navigate to="/admin/boards" replace />
            </RequireBoardsAccess>
          )
        }
      />

      <Route
        path="/admin/supervisors"
        element={
          <RequireAdmin>
            <SupervisorsPage />
          </RequireAdmin>
        }
      />

      <Route
        path="/admin/files/:fileId"
        element={
          <RequireAdmin>
            <SupervisorFilePage />
          </RequireAdmin>
        }
      />

      <Route
        path="/admin/boards"
        element={
          <RequireBoardsAccess>
            <AdminBoardsPage />
          </RequireBoardsAccess>
        }
      />

      <Route
        path="/admin/boards/:boardId"
        element={
          <RequireBoardsAccess>
            <BoardPage />
          </RequireBoardsAccess>
        }
      />

      <Route
        path="/admin/boards/:boardId/members"
        element={
          <RequireAdmin>
            <BoardMembersPage />
          </RequireAdmin>
        }
      />

      <Route
        path="/admin/assign"
        element={
          <RequireAdmin>
            <AssignPage />
          </RequireAdmin>
        }
      />

      {/* ✅ Default redirect:
          - if not logged in → /login
          - if admin → /admin
          - else → /dashboard
      */}
      <Route
        path="*"
        element={
          !hasValidJwt() ? (
            <Navigate to="/login" replace />
          ) : getRole() === "admin" ? (
            <Navigate to="/admin" replace />
          ) : (
            <Navigate to="/admin/boards" replace />
          )
        }
      />
    </Routes>
  );
}
